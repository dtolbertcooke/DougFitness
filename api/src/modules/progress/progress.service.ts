// api/src/modules/progress/progress.service.ts
import { Types } from 'mongoose';
import { AppError } from '../../middleware/errors';
import { SLOT_INDEX } from '../../program/slots';
import { WorkoutSession } from '../sessions/session.model';

export interface ProgressPoint {
  date: Date;
  weight: number | null;
  best: number | null;
}

// Chart data for one slot: one point per completed session that logged it, oldest first.
export function slotProgress(userId: string, slotId: string): Promise<ProgressPoint[]> {
  if (!SLOT_INDEX.has(slotId)) throw new AppError(404, 'Not found');
  return WorkoutSession.aggregate<ProgressPoint>([
    // aggregate() skips Mongoose's automatic casting, so convert the id yourself
    { $match: { userId: new Types.ObjectId(userId), status: 'completed' } },
    { $unwind: '$entries' },
    { $match: { 'entries.slotId': slotId } },
    { $project: { _id: 0, date: '$completedAt', weight: '$entries.weight', best: { $max: '$entries.values' } } },
    { $sort: { date: 1 } },
  ]);
}
