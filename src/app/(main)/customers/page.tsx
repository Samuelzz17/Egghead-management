'use client';

import { useState, useCallback, useMemo } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle, Edit, Trash2, MoreHorizontal, Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Customer, ActivityLog, Sale } from '@/lib/types';
import { appendSheetRowAction, updateSheetRowAction, deleteSheetRowAction } from '@/lib/sheets-actions';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';


const customerSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  phone: z.string().min(1, 'Nomor telepon wajib diisi.'),
  address: z.string().min(1, 'Alamat wajib diisi.'),
});

export function CustomerForm({ open, onOpenChange, customerToEdit, onActionSuccess, allCustomers }: { open: boolean, onOpenChange: (open: boolean) => void, customerToEdit?: Omit<Customer, 'createdAt'> | null, onActionSuccess: () => void, allCustomers: Customer[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof customerSchema>>({
    resolver: zodResolver(customerSchema),
    values: customerToEdit || { name: '', phone: '', address: '' },
  });

  const addLog = useCallback(async (activity: string, details: string) => {
    if (!user || !firestore) return;
    const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
    const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
    await setDoc(logRef, newLog);
    // Sync to sheets
    try {
        await appendSheetRowAction('LOGS', [newLog.id, newLog.date.toDate().toISOString(), newLog.activity, newLog.details, newLog.user]);
    } catch (e) {
        console.error("Sheet Error (addLog):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Gagal mencatat log ke spreadsheet.' });
    }
  }, [user, firestore, toast]);

  const addCustomer = async (customer: Omit<Customer, 'id' | 'createdAt'>) => {
    if(!user || !firestore) return;
    const customerRef = doc(collection(firestore, `users/${user.uid}/customers`));
    const newCustomer = { ...customer, id: customerRef.id, createdAt: Timestamp.now() };
    await setDoc(customerRef, newCustomer);
    // Sync to sheets
    try {
        await appendSheetRowAction('CUSTOMERS', [newCustomer.id, newCustomer.name, newCustomer.phone, newCustomer.address, newCustomer.createdAt.toDate().toISOString()]);
        toast({ title: 'Sukses!', description: 'Pelanggan baru berhasil ditambahkan dan disinkronkan.' });
    } catch(e) {
        console.error("Sheet Error (addCustomer):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Pelanggan disimpan, tapi gagal sinkronisasi ke spreadsheet.' });
    }
    await addLog('Tambah Pelanggan', `Menambah pelanggan baru: ${customer.name}.`);
  };

  const updateCustomer = async (updatedCustomer: Omit<Customer, 'createdAt'>) => {
    if(!user || !firestore) return;
    const customerRef = doc(firestore, `users/${user.uid}/customers`, updatedCustomer.id);
    const customerWithTimestamp = { ...updatedCustomer, createdAt: Timestamp.now() }; // Although we might not update createdAt time, some fields expect it.
    await setDoc(customerRef, updatedCustomer, { merge: true });

    // Sync to sheets
    const rowIndex = allCustomers.findIndex(c => c.id === updatedCustomer.id);
    if (rowIndex !== -1) {
        try {
            await updateSheetRowAction('CUSTOMERS', rowIndex, [updatedCustomer.id, updatedCustomer.name, updatedCustomer.phone, updatedCustomer.address]);
            toast({ title: 'Sukses!', description: 'Data pelanggan berhasil diperbarui dan disinkronkan.' });
        } catch(e) {
             console.error("Sheet Error (updateCustomer):", e);
            toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Data diperbarui, tapi gagal sinkronisasi ke spreadsheet.' });
        }
    } else {
        toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Tidak dapat menemukan baris pelanggan di spreadsheet untuk diperbarui.' });
    }

    await addLog('Edit Pelanggan', `Mengubah data pelanggan: ${updatedCustomer.name}.`);
  };

  async function onSubmit(values: z.infer<typeof customerSchema>) {
    setIsLoading(true);
    try {
        if (customerToEdit) {
            await updateCustomer({ ...values, id: customerToEdit.id });
        } else {
            await addCustomer(values);
        }
        form.reset();
        onOpenChange(false);
        onActionSuccess();
    } catch(error) {
        console.error('Failed to submit customer form', error);
        toast({variant: 'destructive', title: 'Error', description: 'Gagal menyimpan data pelanggan.'})
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
            form.reset();
        }
    }}>
      <DialogContent className='glass-dialog'>
        <DialogHeader>
          <DialogTitle>{customerToEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Pelanggan</FormLabel>
                  <FormControl>
                    <Input placeholder="misalnya, Toko Jaya" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor Telepon</FormLabel>
                  <FormControl>
                    <Input placeholder="misalnya, 081234567890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alamat</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Alamat lengkap pelanggan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={isLoading}>Batal</Button></DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {customerToEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


function CustomerRow({ customer, sales, onActionSuccess, allCustomers }: { customer: Customer, sales: Sale[], onActionSuccess: () => void, allCustomers: Customer[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState<Omit<Customer, 'createdAt'> | null>(null);

    const customerSales = useMemo(() => sales.filter(s => s.customerId === customer.id), [sales, customer.id]);
    const totalReceivables = useMemo(() => customerSales.reduce((acc, sale) => acc + sale.balance, 0), [customerSales]);
    const paymentStatus: 'Lunas' | 'Belum Lunas' = totalReceivables > 0 ? 'Belum Lunas' : 'Lunas';
    
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

    const deleteCustomer = async (id: string) => {
        if(!user || !firestore || !sales) return;
        
        const rowIndex = sales.findIndex(c => c.id === id);

        const customerRef = doc(firestore, `users/${user.uid}/customers`, id);
        await deleteDoc(customerRef);
        
        if (rowIndex !== -1) {
            try {
                await deleteSheetRowAction('CUSTOMERS', rowIndex);
                toast({ title: 'Sukses!', description: 'Data pelanggan berhasil dihapus dan disinkronkan.' });
            } catch(e) {
                console.error("Sheet Error (deleteCustomer):", e);
                toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Data dihapus, tapi gagal sinkronisasi ke spreadsheet.' });
            }
        } else {
            toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Tidak dapat menemukan baris pelanggan di spreadsheet untuk dihapus.' });
        }

        await addLog('Hapus Pelanggan', `Menghapus pelanggan: ${customer.name}.`);
        onActionSuccess();
    };
    
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    }
    
    const handleEditCustomer = (customer: Customer) => {
        setCustomerToEdit(customer);
        setIsEditCustomerDialogOpen(true);
    }


    return (
        <>
            {isEditCustomerDialogOpen && <CustomerForm open={isEditCustomerDialogOpen} onOpenChange={setIsEditCustomerDialogOpen} customerToEdit={customerToEdit} onActionSuccess={onActionSuccess} allCustomers={allCustomers} />}
             <Collapsible asChild>
                <>
                    <TableRow className="cursor-pointer hover:bg-muted/50" data-state={isOpen ? 'open' : 'closed'} onClick={() => setIsOpen(!isOpen)}>
                        <CollapsibleTrigger asChild>
                             <TableCell className="font-medium flex items-center gap-2">
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {customer.name}
                            </TableCell>
                        </CollapsibleTrigger>
                        <TableCell>{customer.phone}</TableCell>
                        <TableCell>{customer.address}</TableCell>
                        <TableCell>
                            <Badge variant={paymentStatus === 'Lunas' ? 'secondary' : 'destructive'} className={cn(paymentStatus === 'Lunas' && "bg-green-100 text-green-800 border-green-200", paymentStatus === 'Belum Lunas' && "bg-red-100 text-red-800 border-red-200")}>
                                {paymentStatus}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Buka menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className='glass-dialog'>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEditCustomer(customer);}}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                    </DropdownMenuItem>
                                    <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} className="text-red-500 focus:bg-red-500/20 focus:text-red-500">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        <span>Hapus</span>
                                        </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                        <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            Tindakan ini tidak dapat diurungkan. Ini akan menghapus data pelanggan secara permanen.
                                        </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteCustomer(customer.id)}>Hapus</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                        <TableRow>
                            <TableCell colSpan={5} className="p-0">
                                <div className="p-4 bg-secondary/30">
                                    <h4 className="font-semibold mb-2">Riwayat Transaksi & Piutang</h4>
                                    {customerSales.length > 0 ? (
                                    <>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Tanggal</TableHead>
                                                    <TableHead>Total Belanja</TableHead>
                                                    <TableHead>Sisa Tagihan</TableHead>
                                                    <TableHead>Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {customerSales.map(sale => (
                                                    <TableRow key={sale.id}>
                                                        <TableCell>{new Date(sale.saleDate+'T00:00:00').toLocaleDateString('id-ID')}</TableCell>
                                                        <TableCell>{formatCurrency(sale.totalPrice)}</TableCell>
                                                        <TableCell>{formatCurrency(sale.balance)}</TableCell>
                                                        <TableCell>
                                                          <Badge variant={sale.paymentStatus === 'Lunas' ? 'secondary' : 'destructive'} className={cn(sale.paymentStatus === 'Lunas' && "bg-green-100 text-green-800 border-green-200", sale.paymentStatus === 'Belum Lunas' && "bg-red-100 text-red-800 border-red-200")}>
                                                            {sale.paymentStatus}
                                                          </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        <div className="text-right mt-4 font-bold">
                                            Total Piutang: <span className="text-destructive">{formatCurrency(totalReceivables)}</span>
                                        </div>
                                    </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Belum ada transaksi untuk pelanggan ini.</p>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    </CollapsibleContent>
                </>
            </Collapsible>
        </>
    );
}


export default function CustomersPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const customersQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/customers`), orderBy('createdAt', 'desc')) : null, [user, firestore]);
  const salesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/sales`)) : null, [user, firestore]);
  const { data: customers, isLoading: isCustomersLoading, error: customersError } = useCollection<Customer>(customersQuery);
  const { data: sales, isLoading: isSalesLoading, error: salesError } = useCollection<Sale>(salesQuery);
  
  const isDataLoading = isCustomersLoading || isSalesLoading;

  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [forceRefetch, setForceRefetch] = useState(0);

  const onActionSuccess = () => setForceRefetch(f => f + 1);

  const filteredCustomers = (customers || []).filter(customer =>
    customer.name.toLowerCase().includes(filter.toLowerCase()) ||
    customer.phone.toLowerCase().includes(filter.toLowerCase()) ||
    customer.address.toLowerCase().includes(filter.toLowerCase())
  );
  
  if (isDataLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h2 className="text-3xl font-black tracking-tight font-headline">Data Pelanggan</h2>
        <p className="text-muted-foreground">Kelola semua data pelanggan Anda di satu tempat.</p>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Daftar Pelanggan</CardTitle>
              <CardDescription>Semua pelanggan yang terdaftar dalam sistem.</CardDescription>
            </div>
            <div className="flex w-full sm:w-auto items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Cari pelanggan..."
                  className="pl-8"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
                <DialogTrigger asChild>
                    <Button className='hidden md:inline-flex'><PlusCircle className="mr-2 h-4 w-4" /> Tambah</Button>
                </DialogTrigger>
                <CustomerForm open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen} onActionSuccess={onActionSuccess} allCustomers={customers || []} />
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Nama</TableHead>
                  <TableHead>Nomor Telepon</TableHead>
                  <TableHead>Alamat</TableHead>
                  <TableHead>Status Pembayaran</TableHead>
                  <TableHead className="text-right w-[100px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <CustomerRow key={customer.id} customer={customer} sales={sales || []} onActionSuccess={onActionSuccess} allCustomers={customers || []} />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      {(customers || []).length > 0 ? 'Pelanggan tidak ditemukan.' : 'Belum ada pelanggan yang ditambahkan.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
        <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 md:hidden">
                <PlusCircle className="h-6 w-6" />
                <span className="sr-only">Tambah Pelanggan</span>
            </Button>
          </DialogTrigger>
          <CustomerForm open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen} onActionSuccess={onActionSuccess} allCustomers={customers || []} />
        </Dialog>
    </div>
  );
}
