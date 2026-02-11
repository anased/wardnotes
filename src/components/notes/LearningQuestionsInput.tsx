// src/components/notes/LearningQuestionsInput.tsx
'use client';

import { useCallback } from 'react';

interface LearningQuestionsInputProps {
  questions: string[];
  onQuestionsChange: (questions: string[]) => void;
  maxQuestions?: number;
  disabled?: boolean;
}

export default function LearningQuestionsInput({
  questions,
  onQuestionsChange,
  maxQuestions = 5,
  disabled = false
}: LearningQuestionsInputProps) {

  const handleQuestionChange = useCallback((index: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    onQuestionsChange(newQuestions);
  }, [questions, onQuestionsChange]);

  const handleAddQuestion = useCallback(() => {
    if (questions.length < maxQuestions) {
      onQuestionsChange([...questions, '']);
    }
  }, [questions, maxQuestions, onQuestionsChange]);

  const handleRemoveQuestion = useCallback((index: number) => {
    if (questions.length > 1) {
      const newQuestions = questions.filter((_, i) => i !== index);
      onQuestionsChange(newQuestions);
    }
  }, [questions, onQuestionsChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Add new question if this is the last one and we haven't hit the limit
      if (index === questions.length - 1 && questions.length < maxQuestions) {
        handleAddQuestion();
      }
    }
  }, [questions.length, maxQuestions, handleAddQuestion]);

  const validQuestionCount = questions.filter(q => q.trim().length > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Learning Questions
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {validQuestionCount}/{maxQuestions} questions
        </span>
      </div>

      {questions.map((question, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="mt-2.5 text-sm text-gray-400 dark:text-gray-500 w-5 text-right shrink-0">
            {index + 1}.
          </span>
          <input
            type="text"
            value={question}
            onChange={(e) => handleQuestionChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            placeholder={
              index === 0
                ? "e.g., What are the radiological features of glioma?"
                : "Add another question..."
            }
            disabled={disabled}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg
              dark:border-gray-600 dark:bg-gray-800 dark:text-white
              focus:ring-2 focus:ring-primary-500 focus:border-transparent
              disabled:opacity-50 disabled:cursor-not-allowed
              placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          {questions.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveQuestion(index)}
              disabled={disabled}
              className="mt-2 p-1 text-gray-400 hover:text-red-500 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Remove question"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}

      {questions.length < maxQuestions && (
        <button
          type="button"
          onClick={handleAddQuestion}
          disabled={disabled}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline
            disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
        >
          + Add question
        </button>
      )}
    </div>
  );
}
