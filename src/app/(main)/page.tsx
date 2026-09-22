'use client';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DollarSign, Loader2, Send, Bot, Sparkles, Beef } from 'lucide-react';
import { chatWithDataAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EggIcon } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { StockEntry, Sale, Expense } from '@/lib/types';


const KpiCard = ({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description: string }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {icon}
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
    </Card>
);

const ChatMessage = ({ message }: { message: { role: 'user' | 'model'; text: string } }) => {
  const userAvatar = PlaceHolderImages.find(img => img.id === 'user-avatar');
  const isModel = message.role === 'model';
  return (
    <div className={cn('flex items-start gap-3', isModel ? '' : 'justify-end')}>
      {isModel && (
         <Avatar className="h-8 w-8 border-2 border-primary/50">
          <AvatarFallback><Bot size={16} /></AvatarFallback>
        </Avatar>
      )}
      <div className={cn(
          'rounded-lg px-3 py-2 max-w-[80%]', 
          isModel ? 'bg-secondary' : 'bg-primary text-primary-foreground'
      )}>
        <p className="text-sm">{message.text}</p>
      </div>
       {!isModel && userAvatar && (
        <Avatar className="h-8 w-8">
            <AvatarImage src={userAvatar.imageUrl} alt="User" data-ai-hint={userAvatar.imageHint} />
            <AvatarFallback>UE</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
};

function AiAssistantContent({stock, sales, expenses}: {stock: StockEntry[], sales: Sale[], expenses: Expense[]}) {
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; content: {text: string}[] }[]>([]);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [chatHistory]);

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt || isLoading) return;

        const userMessage = { role: 'user' as const, content: [{text: prompt}] };
        setChatHistory(prev => [...prev, userMessage]);
        setIsLoading(true);
        setPrompt('');
        
        try {
            const response = await chatWithDataAction({
                eggBatchData: JSON.stringify(stock),
                salesData: JSON.stringify(sales),
                expensesData: JSON.stringify(expenses),
                history: chatHistory,
                prompt: prompt,
            });

            const modelMessage = { role: 'model' as const, content: [{text: response}] };
            setChatHistory(prev => [...prev, modelMessage]);

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal mendapatkan jawaban dari AI.' });
             const modelMessage = { role: 'model' as const, content: [{text: "Maaf, terjadi kesalahan. Silakan coba lagi."}] };
            setChatHistory(prev => [...prev, modelMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="flex flex-col h-full border-0 bg-transparent shadow-none">
            <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                    <Sparkles size={20} className="text-primary"/>
                    Asisten AI
                </CardTitle>
                <CardDescription>Tanyakan apa saja tentang data peternakan Anda.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col gap-4 overflow-hidden">
                <ScrollArea className="flex-grow pr-4" ref={scrollAreaRef}>
                    <div className="space-y-4">
                        <ChatMessage message={{ role: 'model', text: 'Halo! Saya asisten AI Anda. Tanyakan sesuatu tentang data peternakan Anda, misalnya "Berapa total pendapatan bulan ini?"' }} />
                        {chatHistory.map((msg, index) => (
                            <ChatMessage key={index} message={{ role: msg.role, text: msg.content[0].text }} />
                        ))}
                        {isLoading && (
                            <div className="flex items-start gap-3">
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback>AI</AvatarFallback>
                                </Avatar>
                                <div className="rounded-lg px-3 py-2 bg-muted flex items-center">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <form onSubmit={handleChatSubmit} className="flex items-center gap-2 border-t pt-4">
                    <Input
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ketik pertanyaan Anda..."
                        className="flex-grow"
                        disabled={isLoading}
                    />
                    <Button type="submit" size="icon" disabled={isLoading || !prompt}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}

function AiAssistant({stock, sales, expenses}: {stock: StockEntry[], sales: Sale[], expenses: Expense[]}) {
    const [isOpen, setIsOpen] = useState(false);
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                    <Button
                        size="icon"
                        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40"
                    >
                        <Sparkles className="h-6 w-6" />
                        <span className="sr-only">Buka Asisten AI</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] flex flex-col p-0 glass-dialog">
                   <AiAssistantContent stock={stock} sales={sales} expenses={expenses} />
                </SheetContent>
            </Sheet>
        )
    }

    return (
         <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    size="icon"
                    className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-lg"
                >
                    <Sparkles className="h-6 w-6" />
                    <span className="sr-only">Buka Asisten AI</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 h-[500px] flex flex-col p-0 mr-4" align="end">
                 <AiAssistantContent stock={stock} sales={sales} expenses={expenses} />
            </PopoverContent>
        </Popover>
    );
}

export default function DashboardPage() {
    const { user } = useUser();
    const firestore = useFirestore();

    const stockQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/stock`)) : null, [user, firestore]);
    const salesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/sales`), orderBy('saleDate', 'desc')) : null, [user, firestore]);
    const expensesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/expenses`)) : null, [user, firestore]);
    
    const { data: stockEntries, isLoading: isStockLoading } = useCollection<StockEntry>(stockQuery);
    const { data: sales, isLoading: isSalesLoading } = useCollection<Sale>(salesQuery);
    const { data: expenses, isLoading: isExpensesLoading } = useCollection<Expense>(expensesQuery);

    const isDataLoading = isStockLoading || isSalesLoading || isExpensesLoading;

    if (isDataLoading) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }

    const eggStockEntries = (stockEntries || []).filter(s => s.productName && !s.productName.toLowerCase().includes('daging'));
    const eggSalesItems = (sales || []).flatMap(s => s.items || []).filter(i => i.productName && !i.productName.toLowerCase().includes('daging'));
    
    const totalEggsIn = eggStockEntries.reduce((acc, s) => acc + s.quantity, 0);
    const totalEggsSold = eggSalesItems.reduce((acc, item) => acc + item.baseQuantity, 0);
    const eggInventory = totalEggsIn - totalEggsSold;

    const chickenStockEntries = (stockEntries || []).filter(s => s.productName && s.productName.toLowerCase().includes('daging'));
    const chickenSalesItems = (sales || []).flatMap(s => s.items || []).filter(i => i.productName && i.productName.toLowerCase().includes('daging'));

    const totalChickenIn = chickenStockEntries.reduce((acc, s) => acc + s.quantity, 0);
    const totalChickenSold = chickenSalesItems.reduce((acc, item) => acc + item.baseQuantity, 0);
    const chickenInventory = totalChickenIn - totalChickenSold;
    
    const totalRevenue = (sales || []).reduce((acc, s) => acc + s.totalPrice, 0);
    const totalExpenses = (expenses || []).reduce((acc, e) => acc + e.totalAmount, 0);
    const netProfit = totalRevenue - totalExpenses;
    
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    }
    
    const salesTrendData = (sales || []).reduce((acc, sale) => {
        const date = sale.saleDate;
        if (!acc[date]) {
            acc[date] = { date, revenue: 0 };
        }
        acc[date].revenue += sale.totalPrice;
        return acc;
    }, {} as Record<string, { date: string, revenue: number }>);

    const chartData = Object.values(salesTrendData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const chartConfig: ChartConfig = {
      revenue: { label: 'Pendapatan', color: 'hsl(var(--primary))' },
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black tracking-tight font-headline">Dasbor</h2>
                    <p className="text-muted-foreground">Gambaran umum kinerja peternakan telur Anda.</p>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard title="Total Pendapatan" value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} description="Total pendapatan dari semua penjualan." />
                <KpiCard title="Laba Bersih" value={formatCurrency(netProfit)} icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} description="Total pendapatan dikurangi pengeluaran." />
                <KpiCard title="Stok Telur" value={eggInventory.toLocaleString('id-ID')} icon={<EggIcon className="h-4 w-4 text-muted-foreground" />} description="Jumlah telur yang belum terjual saat ini." />
                <KpiCard title="Stok Daging" value={`${chickenInventory.toLocaleString('id-ID')} kg`} icon={<Beef className="h-4 w-4 text-muted-foreground" />} description="Jumlah daging ayam yang tersedia (kg)." />
                <KpiCard title="Pengeluaran" value={formatCurrency(totalExpenses)} icon={<DollarSign className="h-4 w-4 text-muted-foreground" />} description="Total pengeluaran peternakan." />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Pendapatan Penjualan Seiring Waktu</CardTitle>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={chartConfig} className="h-[300px] w-full">
                        <RechartsBarChart accessibilityLayer data={chartData} margin={{ left: 12, right: 12 }}>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)"/>
                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => new Date(value).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})} />
                            <YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => formatCurrency(value)} />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value:any) => formatCurrency(value)} />} />
                            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                        </RechartsBarChart>
                    </ChartContainer>
                </CardContent>
            </Card>
            <AiAssistant stock={stockEntries || []} sales={sales || []} expenses={expenses || []} />
        </div>
    );
}
