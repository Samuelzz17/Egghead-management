'use server';
/**
 * @fileOverview This file defines a Genkit flow for a conversational AI
 * that can answer questions about egg farm data.
 *
 * chatWithData - A function to chat with the AI about farm data.
 * ChatWithDataInput - The input type for the chatWithData function.
 * ChatWithDataOutput - The return type for the chatWithData function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ChatWithDataInputSchema = z.object({
  eggBatchData: z.string().describe('Data stok telur dalam format JSON.'),
  salesData: z.string().describe('Data penjualan dalam format JSON.'),
  expensesData: z.string().describe('Data pengeluaran dalam format JSON.'),
  history: z.array(z.any()).describe("Riwayat percakapan."),
  prompt: z.string().describe('Pertanyaan atau prompt dari pengguna.'),
});
export type ChatWithDataInput = z.infer<typeof ChatWithDataInputSchema>;

const ChatWithDataOutputSchema = z.string().describe("Jawaban dari AI.");
export type ChatWithDataOutput = z.infer<typeof ChatWithDataOutputSchema>;

export async function chatWithData(input: ChatWithDataInput): Promise<ChatWithDataOutput> {
  return chatWithDataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'chatWithDataPrompt',
  input: {schema: ChatWithDataInputSchema},
  output: {format: 'text'},
  prompt: `Anda adalah seorang analis data ahli untuk sebuah peternakan telur bernama "Uncle Egghead". Anda sedang berbicara dengan manajer peternakan. Gunakan data yang disediakan untuk menjawab pertanyaan mereka dengan ringkas dan informatif dalam Bahasa Indonesia.

Berikut adalah data peternakan saat ini:
- Data Stok Telur: {{{eggBatchData}}}
- Data Penjualan: {{{salesData}}}
- Data Pengeluaran: {{{expensesData}}}

Riwayat Percakapan Sebelumnya:
{{#each history}}
  - {{role}}: {{#each content}}{{#if text}}{{text}}{{/if}}{{/each}}
{{/each}}

Pertanyaan Pengguna:
{{{prompt}}}

Jawaban Anda:
`,
});

const chatWithDataFlow = ai.defineFlow(
  {
    name: 'chatWithDataFlow',
    inputSchema: ChatWithDataInputSchema,
    outputSchema: ChatWithDataOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
