import { z } from 'zod';
import { AddCodSchema, ReconcileCodSchema } from '../model/wallet.model';

export type AddCodDto = z.infer<typeof AddCodSchema>;
export type ReconcileCodDto = z.infer<typeof ReconcileCodSchema>;
