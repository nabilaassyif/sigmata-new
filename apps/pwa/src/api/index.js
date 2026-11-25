import { API_MODE, IS_MOCK } from './config';
import { httpAdapter } from './httpAdapter';
import { mockAdapter } from './mockAdapter';

export { API_MODE, IS_MOCK };
export const api = IS_MOCK ? mockAdapter : httpAdapter;

const STATUS_LABEL = {
  pending: 'Dalam Proses',
  processing: 'Dalam Proses',
  awaitingOperator: 'Menunggu Tinjauan',
  forwarded: 'Diteruskan',
};
export const statusLabel = (status) => STATUS_LABEL[status] || status;
