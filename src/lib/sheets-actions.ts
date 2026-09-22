'use server';

import { readSheetData } from '@/ai/flows/read-sheet-data-flow';
import { writeSheetData } from '@/ai/flows/write-sheet-data-flow';
import type { ReadSheetInput } from '@/ai/flows/read-sheet-data-flow';
import type { WriteSheetInput } from '@/ai/flows/write-sheet-data-flow';

const spreadsheetId = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || '';

const SHEET_NAMES = {
    STOCK: 'STOCK',
    SALES: 'SALES',
    EXPENSES: 'EXPENSES',
    CUSTOMERS: 'CUSTOMERS',
    LOGS: 'LOGS',
};

// Pastikan ID ini sesuai dengan ID aktual di Spreadsheet Anda
const SHEET_IDS: { [key in keyof typeof SHEET_NAMES]: number } = {
    STOCK: 0,
    CUSTOMERS: 800347458,
    SALES: 1876404938,
    EXPENSES: 1391993478,
    LOGS: 1248041595,
};

function checkSpreadsheetId() {
    if (!spreadsheetId || spreadsheetId === "GANTI_DENGAN_ID_SPREADSHEET_ANDA") {
        console.warn("GOOGLE_SHEET_ID is not configured in .env file. Sheet actions will be skipped.");
        return false;
    }
    return true;
}

export async function readAllDataAction() {
    if (!checkSpreadsheetId()) {
        return { stock: [], sales: [], expenses: [], customers: [], logs: [] };
    }
    try {
        const ranges = Object.values(SHEET_NAMES).map(name => `${name}!A2:Z`);
        const dataPromises = ranges.map(range => readSheetData({ spreadsheetId, range }));
        const [stock, sales, expenses, customers, logs] = await Promise.all(dataPromises);

        return {
            stock: stock || [],
            sales: sales || [],
            expenses: expenses || [],
            customers: customers || [],
            logs: logs || [],
        };
    } catch (error) {
        console.error('Error reading all data from sheets:', error);
        throw new Error('Failed to read data from Google Sheets.');
    }
}

export async function appendSheetRowAction(sheetName: keyof typeof SHEET_NAMES, values: any[]) {
    if (!checkSpreadsheetId()) return;
    return await writeSheetData({
        spreadsheetId,
        range: SHEET_NAMES[sheetName],
        values: [values],
        action: 'APPEND',
    });
}

export async function updateSheetRowAction(sheetName: keyof typeof SHEET_NAMES, rowIndex: number, values: any[]) {
    if (!checkSpreadsheetId()) return;
    // Google Sheets is 1-indexed, and data starts on row 2. So the row to update is rowIndex + 2.
    const sheetRowIndex = rowIndex + 2; 
    const range = `${SHEET_NAMES[sheetName]}!A${sheetRowIndex}`;
    return await writeSheetData({
        spreadsheetId,
        range: range,
        values: [values],
        action: 'UPDATE',
    });
}

export async function deleteSheetRowAction(sheetName: keyof typeof SHEET_NAMES, rowIndex: number) {
     if (!checkSpreadsheetId()) return;
    // For deleteDimension, startIndex is 0-indexed.
    // Since our data starts on row 2 (after header), the actual row to delete is at index `rowIndex + 1`.
    const sheetRowIndex = rowIndex + 1;
    const sheetId = SHEET_IDS[sheetName];
     if (sheetId === undefined) {
        throw new Error(`Sheet ID for ${sheetName} is not configured.`);
    }

    return await writeSheetData({
        spreadsheetId,
        range: SHEET_NAMES[sheetName], // range is not strictly needed for delete but good for context
        action: 'DELETE',
        rowIndex: sheetRowIndex,
        sheetId: sheetId
    });
}
