// api/src/modules/auth/user.model.ts
import { Schema, model } from 'mongoose';

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false: no query returns this unless it explicitly asks (.select('+passwordHash')).
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

export const User = model('User', UserSchema);
