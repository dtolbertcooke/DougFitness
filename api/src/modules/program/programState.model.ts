// api/src/modules/program/programState.model.ts
import { Schema, model } from 'mongoose';

const SlotStateSchema = new Schema(
  { weight: { type: Number, default: null }, target: { type: Number, required: true } },
  { _id: false },
);

// One document per user: where they are in the 7-day cycle and each slot's current weight/target.
const ProgramStateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    nextDay: { type: Number, default: 1, min: 1, max: 7 },
    slots: { type: Map, of: SlotStateSchema, default: {} },
  },
  { timestamps: true },
);

export const ProgramState = model('ProgramState', ProgramStateSchema);
