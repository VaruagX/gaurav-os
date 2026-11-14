import { addDaysStr } from '../../utils/date';

/** Revision intervals in days: 1, 3, 7, 14, 30 then mastered. */
export const REVISION_INTERVALS = [1, 3, 7, 14, 30];
export const nextRevision = (stage, today) => {
  const s = stage + 1;
  return s >= REVISION_INTERVALS.length
    ? { stage: s, status: 'mastered', next_date: today }
    : { stage: s, status: 'active', next_date: addDaysStr(today, REVISION_INTERVALS[s]) };
};
export const firstRevisionDate = (today) => addDaysStr(today, REVISION_INTERVALS[0]);

/** Leitner boxes for flashcards: box -> days until next review. */
export const BOX_DAYS = [0, 1, 3, 7, 14];
export const gradeCard = (card, correct, today) => {
  const box = correct ? Math.min(card.box + 1, BOX_DAYS.length - 1) : 0;
  return {
    box,
    next_review: addDaysStr(today, correct ? BOX_DAYS[box] : 0),
    correct: card.correct + (correct ? 1 : 0),
    wrong: card.wrong + (correct ? 0 : 1),
  };
};
