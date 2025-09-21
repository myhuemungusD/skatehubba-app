import { z } from 'zod';

// Input validation schemas
export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(32, 'Display name must be 32 characters or less')
  .regex(/^[a-zA-Z0-9\s._-]+$/, 'Display name contains invalid characters');

export const joinCodeSchema = z
  .string()
  .trim()
  .min(4, 'Join code must be at least 4 characters')
  .max(8, 'Join code must be 8 characters or less')
  .regex(/^[A-Z0-9]+$/, 'Join code can only contain uppercase letters and numbers');

// Sanitization functions
export function sanitizeDisplayName(input: string): string {
  return input
    .trim()
    .replace(/[^\w\s._-]/g, '') // Remove special characters except allowed ones
    .slice(0, 32); // Limit length
}

export function sanitizeJoinCode(input: string): string {
  return input
    .replace(/[^A-Z0-9]/gi, '') // Remove non-alphanumeric characters
    .toUpperCase()
    .slice(0, 8); // Limit length
}

// Validation helpers
export function validateDisplayName(name: string): { isValid: boolean; error?: string } {
  try {
    displayNameSchema.parse(name);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0]?.message || 'Invalid display name' };
    }
    return { isValid: false, error: 'Invalid display name' };
  }
}

export function validateJoinCode(code: string): { isValid: boolean; error?: string } {
  try {
    joinCodeSchema.parse(code);
    return { isValid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { isValid: false, error: error.errors[0]?.message || 'Invalid join code' };
    }
    return { isValid: false, error: 'Invalid join code' };
  }
}