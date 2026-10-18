// api/src/modules/sessions/sessions.controller.ts
import type { RequestHandler } from 'express';
import {
  EntryBodySchema,
  EntryParamsSchema,
  ListSessionsQuerySchema,
  SessionParamsSchema,
  StartSessionSchema,
} from './sessions.schemas';
import { completeSession, getSession, listSessions, logEntry, startSession, toDto } from './sessions.service';

export const postSessionHandler: RequestHandler = async (req, res) => {
  const { day } = StartSessionSchema.parse(req.body);
  res.status(201).json(toDto(await startSession(req.userId, day)));
};

export const putEntryHandler: RequestHandler = async (req, res) => {
  const { id, slotId } = EntryParamsSchema.parse(req.params);
  const body = EntryBodySchema.parse(req.body);
  res.status(200).json(toDto(await logEntry(req.userId, id, slotId, body)));
};

export const postCompleteHandler: RequestHandler = async (req, res) => {
  const { id } = SessionParamsSchema.parse(req.params);
  res.status(200).json(toDto(await completeSession(req.userId, id)));
};

export const getSessionHandler: RequestHandler = async (req, res) => {
  const { id } = SessionParamsSchema.parse(req.params);
  res.status(200).json(toDto(await getSession(req.userId, id)));
};

export const listSessionsHandler: RequestHandler = async (req, res) => {
  const query = ListSessionsQuerySchema.parse(req.query);
  res.status(200).json(await listSessions(req.userId, query));
};
