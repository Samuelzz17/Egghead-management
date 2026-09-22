'use server';

import { chatWithData } from '@/ai/flows/chat-with-data-flow';
import type { ChatWithDataInput } from '@/ai/flows/chat-with-data-flow';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
  }
}

export async function chatWithDataAction(input: ChatWithDataInput) {
  try {
    const output = await chatWithData(input);
    return output;
  } catch (error) {
    console.error('Error getting chat response:', error);
    throw new Error('Failed to get AI chat response.');
  }
}


export async function resetAllDataAction(userId: string) {
    if (!userId) {
        throw new Error('User ID is required.');
    }

    const db = getFirestore();
    const collectionsToDelete = ['stock', 'sales', 'expenses', 'customers', 'logs'];

    const batch = db.batch();

    for (const collectionName of collectionsToDelete) {
        const collectionPath = `users/${userId}/${collectionName}`;
        const snapshot = await db.collection(collectionPath).get();
        if (!snapshot.empty) {
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
    }

    try {
        await batch.commit();
        return { success: true, message: 'All transactional data has been reset.' };
    } catch (error) {
        console.error('Error resetting data:', error);
        throw new Error('Failed to reset data in Firestore.');
    }
}
