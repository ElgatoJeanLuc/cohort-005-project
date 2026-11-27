import type { Db } from "./db";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
} from "~/db/schema";

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

export function createQuizQueries(db: Db) {
  function getQuizByLessonId(lessonId: number) {
    return db
      .select()
      .from(quizzes)
      .where(eq(quizzes.lessonId, lessonId))
      .get();
  }

  function getQuizById(quizId: number) {
    return db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  }

  function getQuizWithQuestions(quizId: number) {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) return null;

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const options = getOptionsForQuestions(questions.map((q) => q.id));
    const questionsWithOptions = questions.map((question) => ({
      ...question,
      options: options.filter((o) => o.questionId === question.id),
    }));

    return { ...quiz, questions: questionsWithOptions };
  }

  function getOptionsForQuestions(questionIds: number[]) {
    if (questionIds.length === 0) return [];
    return db
      .select()
      .from(quizOptions)
      .where(inArray(quizOptions.questionId, questionIds))
      .all();
  }

  function getBestAttempt(userId: number, quizId: number) {
    return db
      .select()
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
      )
      .orderBy(desc(quizAttempts.score))
      .limit(1)
      .get();
  }

  function computeResult(
    userId: number,
    quizId: number,
    selectedAnswers: Record<number, number>
  ) {
    try {
      const quiz = db
        .select()
        .from(quizzes)
        .where(eq(quizzes.id, quizId))
        .get();
      if (!quiz) {
        console.error("quiz not found");
        return null;
      }

      const questions = db
        .select()
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quizId))
        .orderBy(quizQuestions.position)
        .all();

      const correctOptions = getOptionsForQuestions(
        questions.map((q) => q.id)
      ).filter((o) => o.isCorrect);

      let correct = 0;
      const total = questions.length;
      const questionResults: QuestionResult[] = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const selected = selectedAnswers[q.id];

        if (!selected) {
          questionResults.push({
            questionId: q.id,
            correct: false,
            selectedOptionId: null,
            correctOptionId: null,
          });
          continue;
        }

        const correctOptionId =
          correctOptions.find((o) => o.questionId === q.id)?.id ?? null;

        const isCorrect = selected === correctOptionId;
        if (isCorrect) correct++;

        questionResults.push({
          questionId: q.id,
          correct: isCorrect,
          selectedOptionId: selected,
          correctOptionId,
        });
      }

      const scoreValue = total > 0 ? correct / total : 0;
      const passed = scoreValue > 0.7;
      const grade = calculateGrade(scoreValue);

      // The attempt and its answers land together, or a half-recorded
      // attempt would count towards the Student's best score.
      const attempt = db.transaction((tx) => {
        const inserted = tx
          .insert(quizAttempts)
          .values({ userId, quizId, score: scoreValue, passed })
          .returning()
          .get();
        const answers = questionResults.flatMap(
          ({ questionId, selectedOptionId }) =>
            selectedOptionId === null
              ? []
              : [{ attemptId: inserted.id, questionId, selectedOptionId }]
        );
        if (answers.length > 0) {
          tx.insert(quizAnswers).values(answers).run();
        }
        return inserted;
      });

      return {
        attemptId: attempt.id,
        score: scoreValue,
        passed,
        grade,
        totalCorrect: correct,
        totalQuestions: total,
        questionResults,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  return {
    getQuizByLessonId,
    getQuizById,
    getQuizWithQuestions,
    getBestAttempt,
    computeResult,
  };
}
