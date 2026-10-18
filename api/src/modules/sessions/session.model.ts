// api/src/modules/sessions/session.model.ts
import { Schema, model } from 'mongoose';

const EntrySchema = new Schema(
  {
    slotId: { type: String, required: true },
    weight: { type: Number, default: null },
    values: { type: [Number], default: [] }, // reps or seconds, one per set
    cardio: { minutes: Number, speedMph: Number, inclinePct: Number },
  },
  { _id: false },
);

const SessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: Number, min: 1, max: 7, required: true },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    entries: { type: [EntrySchema], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
  },
  { timestamps: true },
);

// History, newest first. _id breaks ties between sessions that share a startedAt (cursor pagination).
SessionSchema.index({ userId: 1, startedAt: -1, _id: -1 });
// At most one in-progress session per user, enforced by the database. A check-then-insert in the
// service would race when two requests arrive together; a partial unique index cannot.
SessionSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'in_progress' } });

export const WorkoutSession = model('WorkoutSession', SessionSchema);
