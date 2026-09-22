'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating insightful dashboards
 * with key performance indicators, sales trends, and profit metrics based on egg farm data.
 *
 * generateInsightfulDashboard - A function that generates a customized dashboard.
 * GenerateInsightfulDashboardInput - The input type for the generateInsightfulDashboard function.
 * GenerateInsightfulDashboardOutput - The return type for the generateInsightfulDashboard function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateInsightfulDashboardInputSchema = z.object({
  eggBatchData: z.string().describe('Egg batch data in JSON format.'),
  salesData: z.string().describe('Sales data in JSON format.'),
  expensesData: z.string().describe('Expenses data in JSON format.'),
  dashboardPreferences: z.string().describe('Dashboard customization preferences in JSON format.'),
});
export type GenerateInsightfulDashboardInput = z.infer<typeof GenerateInsightfulDashboardInputSchema>;

const GenerateInsightfulDashboardOutputSchema = z.object({
  dashboardDescription: z.string().describe('A textual description of the generated dashboard and its key insights.'),
  dashboardVisualizationData: z.string().describe('Data suitable for visualizing the dashboard, e.g., JSON format for charts.'),
});
export type GenerateInsightfulDashboardOutput = z.infer<typeof GenerateInsightfulDashboardOutputSchema>;

export async function generateInsightfulDashboard(input: GenerateInsightfulDashboardInput): Promise<GenerateInsightfulDashboardOutput> {
  return generateInsightfulDashboardFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateInsightfulDashboardPrompt',
  input: {schema: GenerateInsightfulDashboardInputSchema},
  output: {schema: GenerateInsightfulDashboardOutputSchema},
  prompt: `You are an expert data analyst specializing in egg farm management. Based on the provided egg batch data, sales data, expenses data, and dashboard preferences, generate a customized dashboard with key performance indicators, sales trends, and profit metrics.  Also, provide a textual description of the dashboard and its key insights.

Egg Batch Data: {{{eggBatchData}}}
Sales Data: {{{salesData}}}
Expenses Data: {{{expensesData}}}
Dashboard Preferences: {{{dashboardPreferences}}}

Ensure that the dashboard visualization data is in JSON format.
`,
});

const generateInsightfulDashboardFlow = ai.defineFlow(
  {
    name: 'generateInsightfulDashboardFlow',
    inputSchema: GenerateInsightfulDashboardInputSchema,
    outputSchema: GenerateInsightfulDashboardOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
