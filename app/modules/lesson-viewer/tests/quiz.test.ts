import { describe, it, expect, beforeEach } from "vitest";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import { calculateGrade } from "../index.server";
import { seedLessonViewer, type LessonViewerFixture } from "./fixtures";

let f: LessonViewerFixture;
let quizId: number;
let studentId: number;
const questions: Array<{ id: number; right: number; wrong: number }> = [];

function addQuestion(text: string, type: QuestionType, position: number) {
  const question = f.db
    .insert(schema.quizQuestions)
    .values({ quizId, questionText: text, questionType: type, position })
    .returning()
    .get();
  const option = (optionText: string, isCorrect: boolean) =>
    f.db
      .insert(schema.quizOptions)
      .values({ questionId: question.id, optionText, isCorrect })
      .returning()
      .get().id;
  const wrong = option("Wrong", false);
  const right = option("Right", true);
  questions.push({ id: question.id, right, wrong });
}

/** Answers the first `rightCount` questions correctly and the rest wrongly. */
function answers(rightCount: number) {
  return Object.fromEntries(
    questions.map((q, i) => [q.id, i < rightCount ? q.right : q.wrong])
  );
}

beforeEach(() => {
  f = seedLessonViewer();
  studentId = f.base.user.id;
  questions.length = 0;
  quizId = f.db
    .insert(schema.quizzes)
    .values({ lessonId: f.lessons.first.id, title: "Check", passingScore: 0.7 })
    .returning()
    .get().id;
  // Inserted out of position order to show questions sort by position.
  addQuestion("Second", QuestionType.TrueFalse, 2);
  addQuestion("First", QuestionType.MultipleChoice, 1);
  questions.reverse();
});

describe("reading the quiz", () => {
  it("finds the quiz for its lesson, and none for another", () => {
    expect(f.viewer.getQuizByLessonId(f.lessons.first.id)?.id).toBe(quizId);
    expect(f.viewer.getQuizByLessonId(f.lessons.second.id)).toBeUndefined();
  });

  it("finds a quiz by id, with the lesson it belongs to", () => {
    expect(f.viewer.getQuizById(quizId)?.lessonId).toBe(f.lessons.first.id);
    expect(f.viewer.getQuizById(quizId + 1000)).toBeUndefined();
  });

  it("returns the questions in order, each with its options", () => {
    const quiz = f.viewer.getQuizWithQuestions(quizId);

    expect(quiz?.title).toBe("Check");
    expect(
      quiz?.questions.map((q) => [q.questionText, q.options.length])
    ).toEqual([
      ["First", 2],
      ["Second", 2],
    ]);
  });

  it("returns null for an unknown quiz", () => {
    expect(f.viewer.getQuizWithQuestions(9999)).toBeNull();
  });
});

describe("computeResult", () => {
  it("scores every answer right as a pass with an A", () => {
    const result = f.viewer.computeResult(studentId, quizId, answers(2));

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: questions[0].id,
        correct: true,
        selectedOptionId: questions[0].right,
        correctOptionId: questions[0].right,
      },
      {
        questionId: questions[1].id,
        correct: true,
        selectedOptionId: questions[1].right,
        correctOptionId: questions[1].right,
      },
    ]);
  });

  it("scores half right as a fail", () => {
    const result = f.viewer.computeResult(studentId, quizId, answers(1));

    expect(result).toMatchObject({ score: 0.5, passed: false, grade: "F" });
    expect(result?.questionResults[1]).toMatchObject({
      correct: false,
      selectedOptionId: questions[1].wrong,
      correctOptionId: questions[1].right,
    });
  });

  it("counts an unanswered question as wrong", () => {
    const result = f.viewer.computeResult(studentId, quizId, {
      [questions[0].id]: questions[0].right,
    });

    expect(result?.totalCorrect).toBe(1);
    expect(result?.questionResults[1]).toEqual({
      questionId: questions[1].id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    });
  });

  it("records the attempt and only the answered questions", () => {
    const result = f.viewer.computeResult(studentId, quizId, {
      [questions[0].id]: questions[0].right,
    });

    const attempt = f.viewer.getBestAttempt(studentId, quizId);
    const saved = f.db.select().from(schema.quizAnswers).all();

    expect(attempt).toMatchObject({ id: result?.attemptId, score: 0.5 });
    expect(saved.map((a) => [a.questionId, a.selectedOptionId])).toEqual([
      [questions[0].id, questions[0].right],
    ]);
  });

  it("keeps the best attempt, not the latest", () => {
    f.viewer.computeResult(studentId, quizId, answers(2));
    f.viewer.computeResult(studentId, quizId, answers(0));

    expect(f.viewer.getBestAttempt(studentId, quizId)?.score).toBe(1);
    expect(
      f.viewer.getBestAttempt(f.base.instructor.id, quizId)
    ).toBeUndefined();
  });

  it("scores a quiz with no questions as 0", () => {
    const empty = f.db
      .insert(schema.quizzes)
      .values({
        lessonId: f.lessons.second.id,
        title: "Empty",
        passingScore: 0.7,
      })
      .returning()
      .get();

    expect(f.viewer.computeResult(studentId, empty.id, {})).toMatchObject({
      score: 0,
      passed: false,
      totalQuestions: 0,
    });
  });

  it("returns null for an unknown quiz", () => {
    expect(f.viewer.computeResult(studentId, 9999, {})).toBeNull();
  });
});

describe("calculateGrade", () => {
  it.each([
    [1, "A"],
    [0.9, "A"],
    [0.89, "B"],
    [0.8, "B"],
    [0.79, "C"],
    [0.7, "C"],
    [0.69, "D"],
    [0.6, "D"],
    [0.59, "F"],
    [0, "F"],
  ])("grades %s as %s", (score, grade) => {
    expect(calculateGrade(score)).toBe(grade);
  });
});
