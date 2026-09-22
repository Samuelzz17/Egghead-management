'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useState, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Timestamp, collection, query, orderBy, doc, setDoc } from 'firebase/firestore';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { ActivityLog } from '@/lib/types';
import { appendSheetRowAction } from '@/lib/sheets-actions';
import { useToast } from '@/hooks/use-toast';


export default function LogsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const logsQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/logs`), orderBy('date', 'desc')) : null, [user, firestore]);
  const { data: logs, isLoading: isDataLoading } = useCollection<ActivityLog>(logsQuery);
  const [filter, setFilter] = useState('');

  const filteredLogs = (logs || []).filter(log =>
    log.activity.toLowerCase().includes(filter.toLowerCase()) ||
    log.details.toLowerCase().includes(filter.toLowerCase()) ||
    log.user.toLowerCase().includes(filter.toLowerCase())
  );
  
    const addLog = useCallback(async (activity: string, details: string) => {
    if (!user || !firestore) return;
    const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
    const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
    await setDoc(logRef, newLog);
     try {
        await appendSheetRowAction('LOGS', [newLog.id, newLog.date.toDate().toISOString(), newLog.activity, newLog.details, newLog.user]);
    } catch (e) {
        console.error("Sheet Error (addLog):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Gagal mencatat log ke spreadsheet.' });
    }
  }, [user, firestore, toast]);

  if (isDataLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black tracking-tight font-headline">Log Aktivitas</h2>
        <p className="text-muted-foreground">
          Semua aktivitas pencatatan dan pengeditan riwayat tercatat di sini.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Riwayat Aktivitas</CardTitle>
              <CardDescription>Jejak audit dari semua perubahan data dalam sistem.</CardDescription>
            </div>
             <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Cari log..."
                  className="pl-8"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Aktivitas</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Pengguna</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDate(log.date)}</TableCell>
                    <TableCell className="font-medium">{log.activity}</TableCell>
                    <TableCell>{log.details}</TableCell>
                    <TableCell>{log.user}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    {(logs || []).length > 0 ? 'Tidak ada log yang cocok.' : 'Belum ada aktivitas yang tercatat.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
