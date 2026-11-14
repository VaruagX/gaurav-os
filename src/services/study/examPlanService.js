import { syllabusRepository, tasksRepository } from '../../database/repositories';
import { run } from '../../database/db';
import { examPlan } from '../college/lectureLogic';
import { todayStr, toDateStr, toEpoch } from '../../utils/date';

/** Create one study task per day (weak topics first, last day for revision) until the exam. Replaces any earlier plan for this exam. */
export async function createExamPlan(exam) {
  if (!exam.subject_id) throw new Error('Link this exam to a subject first (Edit exam → Subject).');
  const topics = await syllabusRepository.forSubject(exam.subject_id);
  if (!topics.length) throw new Error('This subject has no syllabus topics yet. Add them in College → Syllabus first.');
  const plan = examPlan(topics, todayStr(), toDateStr(new Date(exam.exam_at)));
  if (!plan.length) throw new Error('Every topic is already marked done — nothing to plan.');
  const tag = `plan:exam:${exam.id}`;
  await run(`DELETE FROM tasks WHERE notes = ? AND status = 'pending'`, [tag]);
  const subject = exam.subject_name || 'exam';
  for (const day of plan) {
    await tasksRepository.insert({ title: `Study ${subject}: ${day.topics.join(', ')}`, notes: tag, priority: 1, due_at: toEpoch(day.date, '20:00') });
  }
  return plan.length;
}
