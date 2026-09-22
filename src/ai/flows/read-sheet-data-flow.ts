'use server';
/**
 * @fileOverview A Genkit flow for reading data from Google Sheets.
 */

import { ai } from '@/ai/genkit';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

const ReadSheetInputSchema = z.object({
  spreadsheetId: z.string().describe('The ID of the Google Spreadsheet.'),
  range: z.string().describe('The A1 notation of the range to retrieve.'),
});
export type ReadSheetInput = z.infer<typeof ReadSheetInputSchema>;

const ReadSheetOutputSchema = z.array(z.array(z.any())).describe('The data from the sheet.');
export type ReadSheetOutput = z.infer<typeof ReadSheetOutputSchema>;

export async function readSheetData(input: ReadSheetInput): Promise<ReadSheetOutput> {
  return readSheetDataFlow(input);
}

const readSheetDataFlow = ai.defineFlow(
  {
    name: 'readSheetDataFlow',
    inputSchema: ReadSheetInputSchema,
    outputSchema: ReadSheetOutputSchema,
  },
  async ({ spreadsheetId, range }) => {
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const authClient = await auth.getClient();
      const sheets = google.sheets({ version: 'v4', auth: authClient });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      return response.data.values || [];
    } catch (err) {
      const error = err as Error;
      console.error('The API returned an error: ' + error.message, error.stack);
      throw new Error('Failed to read from sheet: ' + error.message);
    }
  }
);
