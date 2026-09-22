'use client';

import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PlusCircle, ArrowUpCircle, ArrowDownCircle, Edit, Trash2, MoreHorizontal, Search, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, Timestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { StockEntry, Sale, Customer, ActivityLog } from '@/lib/types';
import { appendSheetRowAction, updateSheetRowAction, deleteSheetRowAction } from '@/lib/sheets-actions';


const unitOptions = {
  'Butir': 1,
  'Pack': 10,
  'Tray': 30,
  'Kg': 1,
};

const stockEntrySchema = z.object({
  quantity: z.coerce.number().min(1, 'Kuantitas harus minimal 1.'),
  stockInDate: z.string().min(1, 'Tanggal wajib diisi.'),
  productName: z.string().min(1, 'Kualitas telur wajib dipilih.'),
  unit: z.string().min(1, "Unit wajib dipilih."),
});

const productTypes = [
  'Telur TK',
  'Telur TT',
  'Telur TB',
  'Telur Super',
  'Telur Omega Super',
  'Telur Omega TT',
  'Daging Ayam',
];

function StockForm({ open, onOpenChange, stockToEdit, onActionSuccess, allStockEntries }: { open: boolean, onOpenChange: (open: boolean) => void, stockToEdit?: Omit<StockEntry, 'createdAt'> | null, onActionSuccess: () => void, allStockEntries: StockEntry[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof stockEntrySchema>>({
    resolver: zodResolver(stockEntrySchema),
    values: stockToEdit ? {
        ...stockToEdit,
        unit: 'Butir', // Default to Butir for editing, quantity is already in Butir
    } : {
      quantity: 0,
      stockInDate: new Date().toISOString().split('T')[0],
      productName: '',
      unit: 'Butir',
    },
  });

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

  const addStockEntry = async (stockItem: Omit<StockEntry, 'id' | 'createdAt'>) => {
    if(!user || !firestore) return;
    const stockRef = doc(collection(firestore, `users/${user.uid}/stock`));
    const newStock = { ...stockItem, id: stockRef.id, createdAt: Timestamp.now() };
    await setDoc(stockRef, newStock);
    try {
        await appendSheetRowAction('STOCK', [newStock.id, newStock.productName, newStock.quantity, newStock.stockInDate, newStock.createdAt.toDate().toISOString()]);
        toast({ title: 'Sukses!', description: 'Stok masuk berhasil dicatat dan disinkronkan.' });
    } catch (e) {
        console.error("Sheet Error (addStock):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Stok disimpan, tapi gagal sinkronisasi ke spreadsheet.' });
    }
    await addLog('Catat Stok Masuk', `Menambah ${stockItem.quantity} ${stockItem.productName.toLowerCase().includes('daging') ? 'kg' : 'butir'} ${stockItem.productName}.`);
  };

  const updateStockEntry = async (updatedStock: Omit<StockEntry, 'createdAt'>) => {
    if(!user || !firestore) return;
    const stockRef = doc(firestore, `users/${user.uid}/stock`, updatedStock.id);
    const stockWithTimestamp = { ...updatedStock, createdAt: Timestamp.now() };
    await setDoc(stockRef, updatedStock, { merge: true });

    const rowIndex = allStockEntries.findIndex(s => s.id === updatedStock.id);
    if(rowIndex !== -1) {
        try {
            await updateSheetRowAction('STOCK', rowIndex, [updatedStock.id, updatedStock.productName, updatedStock.quantity, updatedStock.stockInDate]);
            toast({ title: 'Sukses!', description: 'Stok masuk berhasil diperbarui dan disinkronkan.' });
        } catch (e) {
            console.error("Sheet Error (updateStock):", e);
            toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Data diperbarui, tapi gagal sinkronisasi ke spreadsheet.' });
        }
    } else {
         toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Tidak dapat menemukan baris stok di spreadsheet untuk diperbarui.' });
    }

    await addLog('Edit Stok Masuk', `Mengubah data stok masuk ID ${updatedStock.id}.`);
  };

  async function onSubmit(values: z.infer<typeof stockEntrySchema>) {
    setIsLoading(true);
    try {
      const totalQuantity = stockToEdit ? values.quantity : values.quantity * unitOptions[values.unit as keyof typeof unitOptions];
      if (stockToEdit) {
        await updateStockEntry({ ...values, id: stockToEdit.id, quantity: totalQuantity });
      } else {
        await addStockEntry({ ...values, quantity: totalQuantity });
      }
      form.reset();
      onOpenChange(false);
      onActionSuccess();
    } catch (error) {
      console.error('Failed to submit stock form', error);
      toast({variant: 'destructive', title: 'Error', description: 'Gagal menyimpan data stok.'})
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='glass-dialog'>
        <DialogHeader>
          <DialogTitle>{stockToEdit ? 'Edit Stok Masuk' : 'Catat Produk Masuk Gudang'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="productName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama Produk</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih produk" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className='glass-dialog'>
                      {productTypes.map(product => (
                        <SelectItem key={product} value={product}>{product}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Kuantitas</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="misalnya, 120" {...field} readOnly={!!stockToEdit} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!stockToEdit}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Unit" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className='glass-dialog'>
                        {Object.keys(unitOptions).map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="stockInDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tanggal Masuk</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
               <DialogClose asChild><Button variant="outline" disabled={isLoading}>Batal</Button></DialogClose>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {stockToEdit ? 'Simpan Perubahan' : 'Catat'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const ProductStockCard = ({ stock, sales }: { stock: StockEntry[], sales: Sale[]}) => {
    const getUnitForProduct = (productName: string) => {
        if (productName && productName.toLowerCase().includes('daging')) return 'kg';
        return 'butir';
    };

    const qualityStock = productTypes.map(productName => {
        const totalIn = (stock || []).filter(s => s.productName === productName).reduce((acc, s) => acc + s.quantity, 0);
        const totalOut = (sales || []).flatMap(s => s.items || [])
                              .filter(item => item.productName === productName)
                              .reduce((acc, item) => acc + (item.baseQuantity ?? 0), 0);
        const currentStock = totalIn - totalOut;
        return { productName, stock: currentStock };
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>Stok Produk Berdasarkan Jenis</CardTitle>
                <CardDescription>Jumlah stok yang tersedia untuk setiap produk.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {qualityStock.map(({ productName, stock }) => (
                      <div key={productName} className="p-4 rounded-lg bg-secondary/50 flex flex-col items-center justify-center text-center">
                          <p className="text-sm text-muted-foreground">{productName}</p>
                          <p className="text-2xl font-bold">{stock.toLocaleString('id-ID')}</p>
                          <p className="text-xs text-muted-foreground">{getUnitForProduct(productName)}</p>
                      </div>
                  ))}
                </div>
            </CardContent>
        </Card>
    );
};


export default function InventoryPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  // Queries
  const stockQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/stock`), orderBy('createdAt', 'desc')) : null, [user, firestore]);
  const salesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/sales`)) : null, [user, firestore]);
  const customersQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/customers`)) : null, [user, firestore]);

  // Data
  const { data: stockEntries, isLoading: isStockLoading, error: stockError } = useCollection<StockEntry>(stockQuery);
  const { data: sales, isLoading: isSalesLoading, error: salesError } = useCollection<Sale>(salesQuery);
  const { data: customers, isLoading: isCustomersLoading, error: customersError } = useCollection<Customer>(customersQuery);
  
  const isDataLoading = isStockLoading || isSalesLoading || isCustomersLoading;
  
  // State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [stockEntryToEdit, setStockEntryToEdit] = useState<Omit<StockEntry, 'createdAt'> | null>(null);
  const [filter, setFilter] = useState('');
  const [forceRefetch, setForceRefetch] = useState(0);

  const onActionSuccess = () => setForceRefetch(f => f + 1);

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
  
  const deleteStockEntry = async (id: string) => {
    if(!user || !firestore || !stockEntries) return;
    const stockToDelete = stockEntries.find(s => s.id === id);
    if (!stockToDelete) return;
    
    const rowIndex = stockEntries.findIndex(s => s.id === id);

    const stockRef = doc(firestore, `users/${user.uid}/stock`, id);
    await deleteDoc(stockRef);
    
    if (rowIndex !== -1) {
        try {
            await deleteSheetRowAction('STOCK', rowIndex);
            toast({ title: 'Sukses!', description: 'Stok masuk berhasil dihapus dan disinkronkan.' });
        } catch(e) {
            console.error("Sheet Error (deleteStock):", e);
            toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Data dihapus, tapi gagal sinkronisasi ke spreadsheet.' });
        }
    } else {
        toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Tidak dapat menemukan baris stok di spreadsheet untuk dihapus.' });
    }

    await addLog('Hapus Stok Masuk', `Menghapus data stok masuk: ${stockToDelete.quantity} ${stockToDelete.productName}.`);
    onActionSuccess();
  };


  if (isDataLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const handleEditStockEntry = (stockItem: StockEntry) => {
    setStockEntryToEdit(stockItem);
    setIsEditDialogOpen(true);
  };
  
  type Transaction = (StockEntry & { type: 'in'; date: string; details: string; baseQuantity: number; }) | 
                     (Sale & { type: 'out'; date: string; details: string; baseQuantity: number; productName: string; originalId: string; });

  const allTransactions: Transaction[] = [
    ...(stockEntries || []).map(s => ({ 
        ...s, 
        type: 'in' as const, 
        date: s.stockInDate,
        details: 'Dari Produksi',
        baseQuantity: s.quantity
    })),
    ...(sales || []).flatMap(s => (s.items || []).map((item, index) => ({
        ...s,
        originalId: s.id,
        id: `${s.id}-${item.productName}-${index}`, // Create a unique key for flatmapped items
        type: 'out' as const, 
        date: s.saleDate,
        productName: item.productName,
        baseQuantity: item.baseQuantity ?? (item.quantity || 0) * (unitOptions[item.unit as keyof typeof unitOptions] || 1),
        details: `Ke ${(customers || []).find(c => c.id === s.customerId)?.name || 'N/A'}`
    })))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredTransactions = allTransactions.filter(tx => {
    const searchTerm = filter.toLowerCase();
    const type = tx.type === 'in' ? 'masuk' : 'keluar';

    return (
      (tx.productName && tx.productName.toLowerCase().includes(searchTerm)) ||
      type.includes(searchTerm) ||
      (tx.details && tx.details.toLowerCase().includes(searchTerm))
    );
  });


  return (
    <div className="space-y-8 pb-16 md:pb-0">
       {isEditDialogOpen && <StockForm open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} stockToEdit={stockEntryToEdit} onActionSuccess={onActionSuccess} allStockEntries={stockEntries || []} />}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight font-headline">Inventaris Produk</h2>
          <p className="text-muted-foreground">Lacak semua produk yang masuk dan keluar dari gudang.</p>
        </div>
         <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="hidden md:inline-flex">
              <PlusCircle className="mr-2 h-4 w-4" /> Catat Produk Masuk
            </Button>
          </DialogTrigger>
          <StockForm open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onActionSuccess={onActionSuccess} allStockEntries={stockEntries || []} />
        </Dialog>
      </div>

      <div className="space-y-8">
        <ProductStockCard stock={stockEntries || []} sales={sales || []} />
        
        <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Riwayat Transaksi Stok</CardTitle>
                  <CardDescription>Semua pergerakan produk yang masuk dan keluar.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Cari transaksi..."
                      className="pl-8"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
              </div>
            </CardHeader>
            <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                  <TableHeader>
                  <TableRow>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead>Kuantitas</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                  </TableHeader>
                  <TableBody>
                  {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                          <TableCell>
                          {tx.type === 'in' ? (
                              <span className="flex items-center text-green-600"><ArrowUpCircle className="mr-2 h-4 w-4" /> Masuk</span>
                          ) : (
                              <span className="flex items-center text-red-600"><ArrowDownCircle className="mr-2 h-4 w-4" /> Keluar</span>
                          )}
                          </TableCell>
                          <TableCell>{new Date(tx.date + 'T00:00:00').toLocaleDateString('id-ID')}</TableCell>
                          <TableCell>{tx.productName}</TableCell>
                          <TableCell>{(tx.baseQuantity || 0).toLocaleString('id-ID')} {tx.productName && tx.productName.toLowerCase().includes('daging') ? 'kg' : 'butir'}</TableCell>
                          <TableCell>{tx.details}</TableCell>
                          <TableCell className="text-right">
                          {tx.type === 'in' && 'stockInDate' in tx && (
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                      <span className="sr-only">Buka menu</span>
                                      <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className='glass-dialog'>
                                  <DropdownMenuItem onClick={() => handleEditStockEntry(tx as StockEntry)}>
                                      <Edit className="mr-2 h-4 w-4" />
                                      <span>Edit</span>
                                  </DropdownMenuItem>
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:bg-red-500/20 focus:text-red-500">
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          <span>Hapus</span>
                                      </DropdownMenuItem>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                      <AlertDialogHeader>
                                          <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                          Tindakan ini tidak dapat diurungkan. Ini akan menghapus data stok masuk secara permanen.
                                          </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel>Batal</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteStockEntry(tx.id)}>Hapus</AlertDialogAction>
                                      </AlertDialogFooter>
                                      </AlertDialogContent>
                                  </AlertDialog>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                          )}
                          </TableCell>
                      </TableRow>
                      ))
                  ) : (
                      <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                          {allTransactions.length > 0 ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.'}
                      </TableCell>
                      </TableRow>
                  )}
                  </TableBody>
              </Table>
            </div>
            </CardContent>
        </Card>
      </div>

       <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
             <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 md:hidden">
              <PlusCircle className="h-6 w-6" />
              <span className="sr-only">Catat Produk Masuk</span>
            </Button>
          </DialogTrigger>
          <StockForm open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onActionSuccess={onActionSuccess} allStockEntries={stockEntries || []} />
        </Dialog>
    </div>
  );
}
