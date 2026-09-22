'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useAuth } from '@/firebase';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Loader2, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { resetAllDataAction } from '@/lib/actions';

const profileSchema = z.object({
  fullName: z.string().min(3, 'Nama lengkap minimal 3 karakter.'),
  email: z.string().email('Alamat email tidak valid.').optional(),
});

export default function SettingsPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: user?.displayName || '',
      email: user?.email || '',
    },
  });

  async function onSubmit(values: z.infer<typeof profileSchema>) {
    if (!user || !auth.currentUser) return;

    setIsLoading(true);
    try {
      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: values.fullName,
      });

      // Update user profile document in Firestore
      const userDocRef = doc(firestore, 'users', user.uid);
      await setDoc(userDocRef, {
        fullName: values.fullName,
        email: values.email,
      }, { merge: true });

      toast({
        title: 'Profil Diperbarui',
        description: 'Informasi profil Anda telah berhasil disimpan.',
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Gagal Memperbarui Profil',
        description: 'Terjadi kesalahan saat menyimpan perubahan.',
      });
    } finally {
      setIsLoading(false);
    }
  }
  
  async function handleResetData() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Gagal',
        description: 'Anda harus login untuk melakukan aksi ini.',
      });
      return;
    }
    
    setIsResetting(true);
    try {
      await resetAllDataAction(user.uid);
      toast({
        title: 'Sukses!',
        description: 'Semua data transaksi telah berhasil dihapus.',
      });
      // Optional: force a reload or redirect to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('Data reset failed', error);
      toast({
        variant: 'destructive',
        title: 'Gagal Mereset Data',
        description: 'Terjadi kesalahan saat menghapus data.',
      });
    } finally {
      setIsResetting(false);
    }
  }

  if (isUserLoading) {
     return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black tracking-tight font-headline">Pengaturan Akun</h2>
        <p className="text-muted-foreground">Kelola informasi profil dan pengaturan akun Anda.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil Pengguna</CardTitle>
          <CardDescription>Perbarui nama dan email Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nama Lengkap</FormLabel>
                    <FormControl>
                      <Input placeholder="Nama lengkap Anda" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} disabled />
                    </FormControl>
                     <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan Perubahan
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <Card className="border-destructive">
        <CardHeader>
            <CardTitle className="text-destructive">Zona Berbahaya</CardTitle>
            <CardDescription>Tindakan di bawah ini tidak dapat diurungkan. Lanjutkan dengan hati-hati.</CardDescription>
        </CardHeader>
        <CardContent>
             <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Reset Semua Data Transaksi
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tindakan ini akan menghapus semua data inventaris, penjualan, pengeluaran, pelanggan, dan log aktivitas secara permanen. Data ini tidak dapat dipulihkan.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleResetData}
                        disabled={isResetting}
                        className="bg-destructive hover:bg-destructive/90"
                    >
                        {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Ya, Hapus Semua Data
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </CardContent>
      </Card>

    </div>
  );
}
