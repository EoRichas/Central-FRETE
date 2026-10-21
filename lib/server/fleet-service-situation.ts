import { FLEET_RELATION_SITUATIONS } from '@/lib/domain/fleet-client-report';
import { enumValue } from './validation';

export function parseServiceSituation(value: unknown) {
  return value == null || value === '' ? null : enumValue(value, 'Situação do serviço', FLEET_RELATION_SITUATIONS);
}
