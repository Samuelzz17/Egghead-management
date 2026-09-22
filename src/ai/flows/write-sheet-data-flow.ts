'use server';
/**
 * @fileOverview A Genkit flow for writing data to Google Sheets.
 */

import { ai } from '@/ai/genkit';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

const WriteActionEnum = z.enum(['APPEND', 'UPDATE', 'DELETE']);

const WriteSheetInputSchema = z.object({
  spreadsheetId: z.string().describe('The ID of the Google Spreadsheet.'),
  range: z.string().describe('The A1 notation of the range to write to.'),
  values: z.array(z.array(z.any())).optional().describe('The data to be written.'),
  action: WriteActionEnum.describe('The write action to perform.'),
  rowIndex: z.number().optional().describe('The index of the row to update or delete (for UPDATE and DELETE actions).'),
  sheetId: z.number().optional().describe('The ID of the sheet for DELETE action.')
});
export type WriteSheetInput = z.infer<typeof WriteSheetInputSchema>;

const WriteSheetOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type WriteSheetOutput = z.infer<typeof WriteSheetOutputSchema>;

export async function writeSheetData(input: WriteSheetInput): Promise<WriteSheetOutput> {
  return writeSheetDataFlow(input);
}

const writeSheetDataFlow = ai.defineFlow(
  {
    name: 'writeSheetDataFlow',
    inputSchema: WriteSheetInputSchema,
    outputSchema: WriteSheetOutputSchema,
  },
  async ({ spreadsheetId, range, values, action, rowIndex, sheetId }) => {
    try {
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

      if (action === 'APPEND') {
        if (!values) throw new Error('Values are required for APPEND action.');
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values,
          },
        });
        return { success: true, message: 'Data appended successfully.' };
      } else if (action === 'UPDATE') {
        if (!values || !range) throw new Error('Values and range are required for UPDATE action.');
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values,
          },
        });
        return { success: true, message: 'Data updated successfully.' };
      } else if (action === 'DELETE') {
        if (rowIndex === undefined || sheetId === undefined) throw new Error('rowIndex and sheetId are required for DELETE action.');
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: "ROWS",
                            startIndex: rowIndex,
                            endIndex: rowIndex + 1
                        }
                    }
                }]
            }
        });
        return { success: true, message: 'Data deleted successfully.' };
      }
      return { success: false, message: 'Invalid action.' };
    } catch (err) {
      const error = err as Error;
      console.error('The API returned an error: ' + error.message, error.stack);
      throw new Error(`Failed to ${action.toLowerCase()} sheet data: ${error.message}`);
    }
  }
);
