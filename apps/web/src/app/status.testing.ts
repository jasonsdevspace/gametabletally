import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * Waits for the kit's status line to say the words, which it puts in a moment after it is told and
 * takes away a while later, so a test waits for them before anything else it awaits.
 */
export const heard = (line: HTMLElement, words: string) =>
    waitFor(() => {
        expect(line).toHaveTextContent(words);
    });

/**
 * Waits for a field's refusal to be said on the status line, then checks it is drawn as the field's
 * error, which marks the field invalid and describes it.
 */
export const refused = async (field: HTMLElement, line: HTMLElement, words: string) => {
    await heard(line, words);
    const error = document.getElementById(`${field.id}-error`);
    expect(error).toBeVisible();
    expect(error).toHaveTextContent(words);
    expect(field).toHaveAttribute('aria-invalid', 'true');
};

/**
 * Waits for a name refused from its Add button to move focus to the field, which is then drawn
 * invalid and described by the refusal, so a screen reader says them together.
 */
export const refusedInPlace = async (field: HTMLElement, words: string) => {
    await waitFor(() => {
        expect(field).toHaveFocus();
    });
    const error = document.getElementById(`${field.id}-error`);
    expect(error).toBeVisible();
    expect(error).toHaveTextContent(words);
    expect(field).toHaveAttribute('aria-invalid', 'true');
};
