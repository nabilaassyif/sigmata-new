import os
from pathlib import Path
import shutil
import tempfile

from huggingface_hub import snapshot_download as snapshotDownload
from filelock import FileLock


requiredFiles = (
    'encoder/config.json', 'encoder/model.safetensors', 'encoder/tokenizer.json',
    'embeddings/embeddings.npy', 'embeddings/ids.json', 'embeddings/manifest.json',
    'grace_core_ft/labels.json', 'grace_core_ft/train_ids.json',
    'grace_core_ft/training_metadata.parquet', 'grace_core_ft/training_summary.json',
    'grace_core_ft/best_checkpoint/_METADATA',
    'grace_core_ft/best_checkpoint/manifest.ocdbt',
    'retrieval/semantic_ids.json', 'retrieval/semantic_backend.json',
    'retrieval/semantic_vectors.npy', 'retrieval/inverted_lists.json',
)


def validate(directory: Path) -> None:
    missing = [name for name in requiredFiles if not (directory / name).is_file() or (directory / name).stat().st_size == 0]
    if missing:
        raise RuntimeError('Incomplete model bundle: ' + ', '.join(missing))


def prepare(root: Path, repo: str, revision: str, token: str | None) -> Path:
    if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
        raise ValueError('Model revision must be a full lowercase commit SHA')
    root.mkdir(parents=True, exist_ok=True)
    with FileLock(str(root / '.download.lock')):
        return prepareLocked(root, repo, revision, token)


def prepareLocked(root: Path, repo: str, revision: str, token: str | None) -> Path:
    destination = root / revision
    if destination.is_dir() and (destination / '.complete').is_file():
        validate(destination)
        return destination
    if destination.exists():
        raise RuntimeError('Incomplete destination exists; remove it before retrying')
    if not token:
        raise RuntimeError('Set HF_TOKEN to a Hugging Face read token for the private model repository')
    temporary = Path(tempfile.mkdtemp(prefix='.download-', dir=root))
    try:
        snapshotDownload(repo_id=repo, revision=revision, token=token, local_dir=temporary)
        validate(temporary)
        (temporary / '.complete').write_text(revision, encoding='utf-8')
        temporary.chmod(0o755)
        temporary.rename(destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return destination


if __name__ == '__main__':
    path = prepare(Path(os.environ['GRACE_MODEL_ROOT']), os.environ['GRACE_MODEL_REPO'],
                   os.environ['GRACE_MODEL_REVISION'], os.environ.get('HF_TOKEN'))
    print(f'Model artifacts ready: {path}', flush=True)
