-- Tutor session reports + billing (docs/tutor-reports-spec.md). Its own migration because a new enum
-- value can't be used in the transaction that adds it.
--
-- `tutor` is an independent tutor using the session-report product at /app. It is NOT Study Hall's
-- room tutor: those are `proctor` accounts assigned as sessions.tutor_id (WWCC-gated).
alter type public.user_role add value if not exists 'tutor';
