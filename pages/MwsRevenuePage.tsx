import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ApiService } from '../services/apiService';
import type { Client } from '../types';
import { DollarSign, RefreshCw, Save, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import DateRangeFilter from '../components/DateRangeFilter';

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg flex items-center border border-slate-200 dark:border-slate-700">
        <div className="bg-primary-100 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 p-3 rounded-full mr-4">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
    </div>
);

interface ClientRevenueCalculatorProps {
    client: Client;
    dateRange: { start: Date | null; end: Date | null };
    onClientUpdate: () => void;
}

const ClientRevenueCalculator: React.FC<ClientRevenueCalculatorProps> = ({ client, dateRange, onClientUpdate }) => {
    const [fee, setFee] = useState(String(client.mws_fixed_fee || ''));
    const [percentage, setPercentage] = useState(String(client.mws_profit_percentage || ''));
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isDirty, setIsDirty] = useState(false);
    const saveTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        setFee(String(client.mws_fixed_fee || ''));
        setPercentage(String(client.mws_profit_percentage || ''));
        setIsDirty(false); // Reset dirty state when client data changes
    }, [client]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    const handleValueChange = (type: 'fee' | 'percentage', value: string) => {
        if (type === 'fee') setFee(value);
        else setPercentage(value);
        
        setIsDirty(true);
        setSaveStatus('idle');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = window.setTimeout(() => {
            handleSave(type, value);
        }, 1500); // Auto-save after 1.5s of inactivity
    };

    const handleSave = async (type: 'fee' | 'percentage', value: string) => {
        setIsSaving(true);
        
        const currentFee = type === 'fee' ? value : fee;
        const currentPercentage = type === 'percentage' ? value : percentage;
        
        try {
            await ApiService.updateClient(client.id, {
                mws_fixed_fee: parseFloat(currentFee) || 0,
                mws_profit_percentage: parseFloat(currentPercentage) || 0,
            });
            setSaveStatus('success');
            setIsDirty(false);
            onClientUpdate();
        } catch (error) {
            setSaveStatus('error');
            console.error("Failed to save client revenue settings:", error);
        } finally {
            setIsSaving(false);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };
    
    const filteredData = useMemo(() => {
        const { leads = [], adSpends = [] } = client;
        const filterStart = dateRange.start;
        const filterEnd = dateRange.end;

        if (!filterStart && !filterEnd) {
            return { filteredLeads: leads, filteredSpends: adSpends };
        }

        const filteredLeads = leads.filter(l => {
            const leadDate = new Date(l.created_at);
            const isAfterStart = filterStart ? leadDate >= filterStart : true;
            const isBeforeEnd = filterEnd ? leadDate <= filterEnd : true;
            return isAfterStart && isBeforeEnd;
        });
        
        const filteredSpends = adSpends.filter(s => {
            const spendDate = new Date(s.date);
            spendDate.setHours(12, 0, 0, 0); // Avoid timezone issues
            const isAfterStart = filterStart ? spendDate >= filterStart : true;
            const isBeforeEnd = filterEnd ? spendDate <= filterEnd : true;
            return isAfterStart && isBeforeEnd;
        });

        return { filteredLeads, filteredSpends };
    }, [client, dateRange]);

    const calculations = useMemo(() => {
        const clientRevenue = filteredData.filteredLeads
            .filter(l => l.status === 'Vinto')
            .reduce((sum, l) => sum + (l.value || 0), 0);
        
        const clientSpend = filteredData.filteredSpends.reduce((sum, s) => sum + s.amount, 0);
        
        const clientProfit = clientRevenue - clientSpend;

        const mwsFixedFee = parseFloat(fee) || 0;
        const mwsProfitPercentage = parseFloat(percentage) || 0;
        const mwsProfitShare = clientProfit > 0 ? (clientProfit * mwsProfitPercentage) / 100 : 0;
        const mwsRevenue = mwsFixedFee + mwsProfitShare;

        return { clientRevenue, clientSpend, clientProfit, mwsRevenue };
    }, [filteredData, fee, percentage]);
    
    const formatCurrency = (value: number) => value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    const profitColor = calculations.clientProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400';

    const renderStatusIndicator = () => {
        // FIX: Wrapped icons in a span with a title attribute to fix prop error.
        if (isSaving) return <span title="Salvataggio..."><RefreshCw size={16} className="animate-spin text-gray-500" /></span>;
        switch (saveStatus) {
            case 'success': return <span title="Salvato"><CheckCircle size={16} className="text-green-500" /></span>;
            case 'error': return <span title="Errore nel salvataggio"><AlertCircle size={16} className="text-red-500" /></span>;
            default: // idle
                if (isDirty) {
                    return <span title="Modifiche in attesa di salvataggio"><Save size={16} className="text-gray-400" /></span>;
                }
                return <div className="w-4 h-4" />; // Empty state when not dirty
        }
    };
    
    return (
        <>
        {/* Desktop Row */}
        <tr className="hidden md:table-row hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">{client.name}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-gray-300">{formatCurrency(calculations.clientRevenue)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-gray-300">{formatCurrency(calculations.clientSpend)}</td>
            <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${profitColor}`}>{formatCurrency(calculations.clientProfit)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
                <input type="number" value={fee} onChange={e => handleValueChange('fee', e.target.value)} className="w-24 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-1 px-2 text-sm" placeholder="0"/>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
                <input type="number" value={percentage} onChange={e => handleValueChange('percentage', e.target.value)} className="w-20 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-1 px-2 text-sm" placeholder="0"/>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-primary-600 dark:text-primary-400">{formatCurrency(calculations.mwsRevenue)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm">
                 <div className="w-10 h-10 flex items-center justify-center">{renderStatusIndicator()}</div>
            </td>
        </tr>
        {/* Mobile Card */}
        <div className="md:hidden p-4 rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 space-y-3">
            <h4 className="font-bold text-lg text-slate-900 dark:text-white">{client.name}</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-slate-500 dark:text-gray-400">Fatturato Cliente:</div><div className="font-medium text-right text-slate-700 dark:text-gray-200">{formatCurrency(calculations.clientRevenue)}</div>
                <div className="text-slate-500 dark:text-gray-400">Spesa Pubblicitaria:</div><div className="font-medium text-right text-slate-700 dark:text-gray-200">{formatCurrency(calculations.clientSpend)}</div>
                <div className="text-slate-500 dark:text-gray-400">Profitto Cliente:</div><div className={`font-semibold text-right ${profitColor}`}>{formatCurrency(calculations.clientProfit)}</div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">Compenso Fisso (€)</label>
                    <input type="number" value={fee} onChange={e => handleValueChange('fee', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-1 px-2 text-sm" placeholder="0"/>
                </div>
                 <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">% su Profitto</label>
                    <input type="number" value={percentage} onChange={e => handleValueChange('percentage', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md py-1 px-2 text-sm" placeholder="0"/>
                </div>
            </div>
             <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="font-bold text-primary-600 dark:text-primary-400">Fatturato MWS: {formatCurrency(calculations.mwsRevenue)}</div>
                <div className="p-2 w-10 h-10 flex items-center justify-center">{renderStatusIndicator()}</div>
            </div>
        </div>
        </>
    );
};


const MwsRevenuePage: React.FC = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });

    const fetchData = useCallback(async () => {
        if (!isRefreshing) setIsLoading(true);
        try {
            const clientsData = await ApiService.getClients();
            setClients(clientsData);
        } catch (error) {
            console.error("Failed to fetch clients:", error);
        } finally {
            if (!isRefreshing) setIsLoading(false);
        }
    }, [isRefreshing]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await fetchData();
        setIsRefreshing(false);
    }, [fetchData]);

    const totalMwsRevenue = useMemo(() => {
        return clients.reduce((total, client) => {
            const { leads = [], adSpends = [] } = client;
            const filterStart = dateRange.start;
            const filterEnd = dateRange.end;

            const clientLeads = (!filterStart && !filterEnd) ? leads : leads.filter(l => {
                const leadDate = new Date(l.created_at);
                const isAfterStart = filterStart ? leadDate >= filterStart : true;
                const isBeforeEnd = filterEnd ? leadDate <= filterEnd : true;
                return isAfterStart && isBeforeEnd;
            });
            
            const clientSpends = (!filterStart && !filterEnd) ? adSpends : adSpends.filter(s => {
                const spendDate = new Date(s.date);
                spendDate.setHours(12, 0, 0, 0);
                const isAfterStart = filterStart ? spendDate >= filterStart : true;
                const isBeforeEnd = filterEnd ? spendDate <= filterEnd : true;
                return isAfterStart && isBeforeEnd;
            });

            const clientRevenue = clientLeads
                .filter(l => l.status === 'Vinto')
                .reduce((sum, l) => sum + (l.value || 0), 0);
            
            const clientSpend = clientSpends.reduce((sum, s) => sum + s.amount, 0);
            const clientProfit = clientRevenue - clientSpend;

            const mwsFixedFee = client.mws_fixed_fee || 0;
            const mwsProfitPercentage = client.mws_profit_percentage || 0;
            const mwsProfitShare = clientProfit > 0 ? (clientProfit * mwsProfitPercentage) / 100 : 0;
            
            return total + mwsFixedFee + mwsProfitShare;
        }, 0);
    }, [clients, dateRange]);


    if (isLoading) {
        return <div className="text-center p-8">Caricamento dati...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div className="flex items-center space-x-3">
                    <DollarSign className="w-8 h-8 text-primary-500 dark:text-primary-400" />
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Fatturato MWS</h2>
                </div>
                 <button
                    onClick={handleRefresh}
                    disabled={isRefreshing || isLoading}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 disabled:cursor-wait transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                    title="Aggiorna dati"
                >
                    <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>
            
             <StatCard 
                title="Fatturato Totale MWS (Periodo Selezionato)" 
                value={totalMwsRevenue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                icon={<TrendingUp />}
            />

            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700">
                <DateRangeFilter onDateChange={(range) => setDateRange(range as { start: Date | null, end: Date | null })} />
            </div>

            <div className="bg-white dark:bg-slate-800 shadow-xl rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm hidden md:table">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cliente</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fatturato Cliente</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Spesa</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Profitto Cliente</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fisso MWS (€)</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% Profitto MWS</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fatturato MWS</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Stato</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {clients.map(client => (
                                <ClientRevenueCalculator
                                    key={client.id}
                                    client={client}
                                    dateRange={dateRange}
                                    onClientUpdate={fetchData}
                                />
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-right text-sm text-slate-800 dark:text-white uppercase">Totale Fatturato MWS</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-primary-600 dark:text-primary-400">{totalMwsRevenue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                    <div className="md:hidden p-2 space-y-3">
                        {clients.map(client => (
                            <ClientRevenueCalculator
                                key={client.id}
                                client={client}
                                dateRange={dateRange}
                                onClientUpdate={fetchData}
                            />
                        ))}
                    </div>
                </div>
                {clients.length > 0 && (
                    <div className="md:hidden p-4 bg-slate-100 dark:bg-slate-950 rounded-b-lg flex justify-between items-center">
                        <span className="text-md font-bold text-slate-800 dark:text-white uppercase">Totale Fatturato MWS</span>
                        <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{totalMwsRevenue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MwsRevenuePage;
