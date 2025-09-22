import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import type { Lead, Client } from '../types';
import { ApiService } from '../services/apiService';
import { Tag, Calendar, Info, DollarSign, Briefcase, MessageCircle, History, Sparkles, Copy, Loader2, Check, Phone, Edit, Trash2, Mail, Save, X, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Funzione di copia robusta con fallback
const copyTextToClipboard = async (text: string): Promise<boolean> => {
    // Approccio moderno: navigator.clipboard (solo in contesti sicuri)
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Copia con navigator.clipboard fallita:', err);
            // Il fallback verrà tentato di seguito
        }
    }

    // Fallback per browser più vecchi o contesti non sicuri: document.execCommand
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Rendi l'elemento invisibile
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!successful) {
            console.error('Copia di fallback (execCommand) non ha avuto successo.');
        }
        return successful;
    } catch (err) {
        console.error('Copia di fallback fallita con errore:', err);
        document.body.removeChild(textArea);
        return false;
    }
};

interface LeadDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    lead: Lead | null;
    client?: Client | null;
    historicalLeads?: Lead[];
    onAddNote?: (clientId: string, leadId: string, note: string) => Promise<void>;
    onUpdateNote?: (clientId: string, leadId: string, noteId: string, content: string) => Promise<void>;
    onDeleteNote?: (clientId: string, leadId: string, noteId: string) => Promise<void>;
    onHistoricalLeadAdded?: (newLead: Lead) => void;
    onHistoricalLeadUpdated?: (updatedLead: Lead) => void;
    onHistoricalLeadDeleted?: (deletedLeadId: string) => void;
    onLeadUpdate?: (updatedLead: Lead) => void;
}

const statusColors: Record<Lead['status'], string> = {
    'Nuovo': 'bg-slate-500 dark:bg-slate-600 text-white',
    'Contattato': 'bg-yellow-400 dark:bg-yellow-500 text-slate-800 dark:text-black',
    'In Lavorazione': 'bg-purple-400 dark:bg-purple-500 text-white',
    'Perso': 'bg-red-500 text-white',
    'Vinto': 'bg-green-500 text-white',
};

const WhatsAppIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 4.315 1.731 6.086l.287.468-1.03 3.727 3.75-1.025.45.29c1.693 1.054 3.543 1.599 5.576 1.6z"/>
    </svg>
);

const DetailRow: React.FC<{ icon: React.ReactNode, label: string, value: React.ReactNode }> = ({ icon, label, value }) => (
    <div className="flex items-start py-3">
        <div className="flex items-center w-1/3 text-sm text-gray-500 dark:text-gray-400">
            {icon}
            <span className="ml-2 font-medium">{label}</span>
        </div>
        <div className="w-2/3 text-sm text-slate-800 dark:text-white font-semibold">
            {value}
        </div>
    </div>
);

const MESSAGE_TEMPLATES: Record<string, { label: string; template: string }> = {
  cambio: {
    label: 'Cambio Automatico',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per il [tipo di tagliando] della sua auto, targata [targa]:  
💰 **Prezzo speciale** [prezzo] IVA compresa, comprensivo di:
• Olio specifico nella quantità necessaria per il lavaggio  
• Filtro e guarnizioni  
• Controlli diagnostici inclusi  
✅ Effettuare l’intervento nei tempi consigliati mantiene il cambio fluido e silenzioso, prevenendo costose riparazioni.  
📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
📍Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  motore: {
    label: 'Tagliando Motore Completo',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per il [tipo di tagliando] della sua auto targata [targa]:  
💰 *Prezzo speciale* [prezzo] IVA compresa, comprensivo di:
•⁠  ⁠Olio motore specifico  
•⁠  ⁠Tutti i filtri: filtro Olio, filtro Aria, filtro Carburante, filtro Abitacolo  
•⁠  ⁠Manodopera, azzeramento service e controllo diagnostico generale.
•⁠  ⁠Controllo livelli e pressioni gomme.
📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
📍Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  motore_e_cambio: {
    label: 'Tagliando Motore e Cambio',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per il [tipo di tagliando] della sua auto, targata [targa]:  
💰 Prezzo speciale [prezzo] IVA compresa, comprensivo di:
• Olio cambio specifico nella quantità necessaria per il lavaggio  
• Filtro e guarnizioni del cambio 
• Controlli diagnostici specifici per il cambio   
•  ⁠Olio motore specifico  
•⁠  ⁠Tutti i filtri: filtro Olio, filtro Aria, filtro Carburante, filtro Abitacolo  
•⁠  ⁠Manodopera, azzeramento service e controllo diagnostico generale.
•⁠  ⁠Controllo livelli e pressioni gomme.

📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
📍Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  catena_distribuzione: {
    label: 'Catena Distribuzione',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per la catena di [tipo di tagliando] della sua auto targata [targa]:  
💰 *Prezzo speciale* [prezzo] IVA compresa, comprensivo di:
•⁠  ⁠Kit catena distribuzione completo
•  Cinghia esterna Poly-V
•⁠  ⁠Olio motore e filtro olio   
•⁠  ⁠Manodopera, e controllo diagnostico.
📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  cinghia_distribuzione: {
    label: 'Cinghia Distribuzione',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per la cinghia [tipo di tagliando] della sua auto targata [targa]:  
💰 *Prezzo speciale* [prezzo] IVA compresa, comprensivo di:
•⁠  ⁠Kit cinghia distribuzione completo
•  Cinghia esterna Poly-V
•⁠  ⁠liquido antigelo    
•⁠  ⁠Manodopera, e controllo diagnostico.
📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  catena_e_tagliando_motore: {
    label: 'Catena Distribuzione e Tagliando Motore',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per la catena [tipo di tagliando] della sua auto targata [targa]:  
💰 Prezzo speciale [prezzo] IVA compresa, comprensivo di:
•⁠  ⁠Kit catena distribuzione completo   
•  Cinghia esterna Poly-V
•⁠  ⁠Olio motore specifico  
•⁠  ⁠Tutti i filtri: filtro Olio, filtro Aria, filtro Carburante, filtro Abitacolo  
•⁠  ⁠Manodopera, azzeramento service e controllo diagnostico generale.
•⁠  ⁠Controllo livelli e pressioni gomme.
📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  cinghia_e_tagliando_motore: {
    label: 'Cinghia Distribuzione e Tagliando Motore',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo per la cinghia [tipo di tagliando] della sua auto targata [targa]:  
💰 Prezzo speciale [prezzo] IVA compresa, comprensivo di:
•⁠  ⁠Kit cinghia distribuzione completo   
•  Cinghia esterna Poly-V
•⁠  ⁠liquido antigelo    
•⁠  ⁠Olio motore specifico  
•⁠  ⁠Tutti i filtri: filtro Olio, filtro Aria, filtro Carburante , filtro Abitacolo  
•⁠  ⁠Manodopera, azzeramento service e controllo diagnostico generale.
•⁠  ⁠Controllo livelli e pressioni gomme.

📅 Prenotando ora, le garantiamo il prezzo indicato, anche se l’intervento verrà effettuato più avanti.

Resto a disposizione.
Auto Facchetti – 3343696573
Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  },
  distribuzione: {
    label: 'Altro',
    template: `💬 Buongiorno [nome_lead], sono Luca dell'Autoriparazioni Facchetti.  
In merito alla sua richiesta, le confermo il preventivo in allegato . 
Resto a disposizione.
Auto Facchetti – 3343696573
📍Ci troviamo in Via Giacomo Leopardi 7 Pedrengo (BG)`
  }
};

const EditHistoricalLeadForm: React.FC<{
    lead: Lead;
    client: Client;
    onSuccess: (updatedLead: Lead) => void;
    onCancel: () => void;
}> = ({ lead, client, onSuccess, onCancel }) => {
    const [service, setService] = useState(lead.service || '');
    const [value, setValue] = useState(String(lead.value || ''));
    const [date, setDate] = useState(new Date(lead.created_at).toISOString().split('T')[0]);
    const [notes, setNotes] = useState(lead.notes?.[0]?.content || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!service || !value) {
            setError('Servizio e valore sono obbligatori.');
            return;
        }

        setIsSubmitting(true);
        try {
            const updatedLead = await ApiService.updateHistoricalLead(
                lead.id,
                {
                    service,
                    value: Number(value),
                    date,
                    notes,
                },
                lead.notes?.[0]?.id
            );
            onSuccess(updatedLead);
        } catch (err: any) {
            setError(err.message || 'Errore durante l\'aggiornamento.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
         <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-3">
                Modifica Lavoro
            </h4>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Servizio Effettuato</label>
                        <select value={service} onChange={e => setService(e.target.value)} required className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm">
                            <option value="" disabled>Seleziona...</option>
                            {client?.services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Valore (€)</label>
                        <input type="number" value={value} onChange={e => setValue(e.target.value)} required placeholder="Es. 150" className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Data Intervento</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Note (Opzionale)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Es. Cliente venuto di persona..." className="w-full h-20 p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                </div>
                {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
                <div className="text-right flex items-center justify-end space-x-2">
                    <button type="button" onClick={onCancel} className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-white px-4 py-2 text-sm rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                        Annulla
                    </button>
                    <button type="submit" disabled={isSubmitting} className="bg-primary-600 text-white px-4 py-2 text-sm rounded-lg shadow hover:bg-primary-700 transition-colors disabled:opacity-50">
                        {isSubmitting ? 'Salvataggio...' : 'Salva Modifiche'}
                    </button>
                </div>
            </form>
        </div>
    );
};


const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ isOpen, onClose, lead, client, historicalLeads, onAddNote, onUpdateNote, onDeleteNote, onHistoricalLeadAdded, onHistoricalLeadUpdated, onHistoricalLeadDeleted, onLeadUpdate }) => {
    const { t } = useTranslation();
    const [newNote, setNewNote] = useState('');
    const [isSubmittingNote, setIsSubmittingNote] = useState(false);
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState('');
    const [messageCopied, setMessageCopied] = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [emailCopied, setEmailCopied] = useState(false);
    const [serviceCopied, setServiceCopied] = useState(false);
    const [targaCopied, setTargaCopied] = useState(false);
    const [activeTab, setActiveTab] = useState('dati');
    const [selectedTemplateKey, setSelectedTemplateKey] = useState('cambio');
    const [price, setPrice] = useState('');
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingNoteContent, setEditingNoteContent] = useState('');

    // State for Targa editing
    const [isEditingTarga, setIsEditingTarga] = useState(false);
    const [editableTarga, setEditableTarga] = useState('');
    const [isSavingTarga, setIsSavingTarga] = useState(false);

    // State for historical lead form
    const [historicalService, setHistoricalService] = useState('');
    const [historicalValue, setHistoricalValue] = useState('');
    const [historicalDate, setHistoricalDate] = useState(new Date().toISOString().split('T')[0]);
    const [historicalNotes, setHistoricalNotes] = useState('');
    const [isSubmittingHistorical, setIsSubmittingHistorical] = useState(false);
    const [historicalError, setHistoricalError] = useState('');
    const [editingHistoricalLead, setEditingHistoricalLead] = useState<Lead | null>(null);

    useEffect(() => {
        if (isOpen) {
            setGeneratedMessage('');
            setIsGenerating(false);
            setGenerationError('');
            setMessageCopied(false);
            setPhoneCopied(false);
            setEmailCopied(false);
            setServiceCopied(false);
            setTargaCopied(false);
            setActiveTab('dati');
            setSelectedTemplateKey('cambio');
            setPrice('');
            setEditingNoteId(null);
            setEditingNoteContent('');
            setIsEditingTarga(false);

            // Reset historical form
            if (client?.services?.[0]) {
                setHistoricalService(client.services[0].name);
            } else {
                setHistoricalService('');
            }
            setHistoricalValue('');
            setHistoricalDate(new Date().toISOString().split('T')[0]);
            setHistoricalNotes('');
            setHistoricalError('');
            setEditingHistoricalLead(null);
        }
    }, [isOpen, lead, client]);

    if (!isOpen || !lead) return null;

    const isFacchetti = client?.name?.toLowerCase().includes('facche');
    
    const getTipoTagliando = (currentLead: Lead): string => {
        const data = currentLead.data || {};
        
        const searchKeys = [
            'tipo di tagliando', 'tipo_di_tagliando', 'tipo_tagliando',
            'tagliando', 'servizio richiesto', 'servizio_richiesto',
            'servizio', 'service'
        ];

        for (const searchKey of searchKeys) {
            const normalizedSearchKey = searchKey.replace(/_/g, ' ').toLowerCase();
            const foundKey = Object.keys(data).find(dataKey => 
                dataKey.replace(/_/g, ' ').toLowerCase() === normalizedSearchKey
            );
            
            if (foundKey) {
                const value = data[foundKey];
                if (value && typeof value === 'string' && value.trim() !== '') {
                    return value;
                }
            }
        }
        
        for (const dataKey in data) {
            if (dataKey.toLowerCase().includes('tagliando')) {
                const value = data[dataKey];
                if (value && typeof value === 'string' && value.trim() !== '') {
                    return value;
                }
            }
        }

        return currentLead.service || '';
    };

    const tipoTagliando = getTipoTagliando(lead);

    const getFieldLabel = (key: string) => {
        if (client) {
            for (const service of client.services) {
                const field = service.fields.find(f => f.name === key);
                if (field) return field.label;
            }
        }
        return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
    }

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.trim() || !client || !onAddNote) return;

        setIsSubmittingNote(true);
        try {
            await onAddNote(client.id, lead.id, newNote);
            setNewNote('');
        } catch (error) {
            console.error("Error adding note in modal:", error);
        } finally {
            setIsSubmittingNote(false);
        }
    };

    const handleStartEditNote = (note: { id: string, content: string }) => {
        setEditingNoteId(note.id);
        setEditingNoteContent(note.content);
    };

    const handleCancelEditNote = () => {
        setEditingNoteId(null);
        setEditingNoteContent('');
    };

    const handleSaveNote = async (noteId: string) => {
        if (!client || !onUpdateNote || !editingNoteContent.trim()) return;
        await onUpdateNote(client.id, lead.id, noteId, editingNoteContent);
        handleCancelEditNote();
    };

    const handleDeleteNote = (noteId: string) => {
        if (!client || !onDeleteNote) return;
        if (window.confirm("Sei sicuro di voler eliminare questa nota?")) {
            onDeleteNote(client.id, lead.id, noteId);
        }
    };

    const handleGenerateMessage = () => {
        if (!lead) return;
        setIsGenerating(true);
        setGenerationError('');
        setGeneratedMessage('');

        setTimeout(() => {
            try {
                const selectedTemplateObject = MESSAGE_TEMPLATES[selectedTemplateKey];

                if (selectedTemplateObject) {
                    let processedTemplate = selectedTemplateObject.template;
                    processedTemplate = processedTemplate.replace(/\[nome_lead\]/g, lead.data.nome || '[nome non specificato]');
                    processedTemplate = processedTemplate.replace(/\[tipo di tagliando\]/g, tipoTagliando || '[servizio non specificato]');
                    processedTemplate = processedTemplate.replace(/\[targa\]/g, lead.data.targa || '[targa non specificata]');
                    processedTemplate = processedTemplate.replace(/\[prezzo\]/g, price ? `${price}€` : '[prezzo non specificato]');
        
                    setGeneratedMessage(processedTemplate);
                } else {
                    setGenerationError("Seleziona un modello di messaggio valido.");
                }
            } catch (error) {
                console.error("Error processing template:", error);
                setGenerationError("Si è verificato un errore durante la preparazione del messaggio.");
            } finally {
                setIsGenerating(false);
            }
        }, 300);
    };

    const handleCopyMessage = async () => {
        if (!generatedMessage) return;
        const success = await copyTextToClipboard(generatedMessage);
        if (success) {
            setMessageCopied(true);
            setTimeout(() => setMessageCopied(false), 2000);
        } else {
            alert("Impossibile copiare il messaggio. Prova a farlo manualmente.");
        }
    };

    const handleCopyPhone = async () => {
        if (!lead?.data?.telefono) return;
        const success = await copyTextToClipboard(lead.data.telefono);
        if (success) {
            setPhoneCopied(true);
            setTimeout(() => setPhoneCopied(false), 2000);
        } else {
            alert("Impossibile copiare il numero. Prova a farlo manualmente.");
        }
    };
    
    const handleCopyEmail = async () => {
        const email = lead?.data?.mail || lead?.data?.email;
        if (!email) return;
        const success = await copyTextToClipboard(email);
        if (success) {
            setEmailCopied(true);
            setTimeout(() => setEmailCopied(false), 2000);
        } else {
            alert("Impossibile copiare l'email. Prova a farlo manualmente.");
        }
    };
    
    const handleCopyService = async () => {
        if (!tipoTagliando) return;
        const success = await copyTextToClipboard(tipoTagliando);
        if (success) {
            setServiceCopied(true);
            setTimeout(() => setServiceCopied(false), 2000);
        } else {
            alert("Impossibile copiare il servizio. Prova a farlo manualmente.");
        }
    };
    
    const handleCopyTarga = async () => {
        if (!lead?.data?.targa) return;
        const success = await copyTextToClipboard(lead.data.targa);
        if (success) {
            setTargaCopied(true);
            setTimeout(() => setTargaCopied(false), 2000);
        } else {
            alert("Impossibile copiare la targa. Prova a farlo manualmente.");
        }
    };

    const handleSaveTarga = async () => {
        if (!client || !onLeadUpdate) return;
        setIsSavingTarga(true);
        const updatedData = { ...lead.data, targa: editableTarga };
        try {
            const updatedLead = await ApiService.updateLead(client.id, lead.id, { data: updatedData });
            onLeadUpdate(updatedLead);
            setIsEditingTarga(false);
        } catch (e) {
            console.error("Failed to update targa", e);
            alert("Errore durante il salvataggio della targa.");
        } finally {
            setIsSavingTarga(false);
        }
    };


    const normalizeForWhatsApp = (phone: string | undefined): string => {
        if (!phone) return '';
        let normalized = phone.replace(/[\s-()]/g, '');
        if (normalized.startsWith('+')) {
            normalized = normalized.substring(1);
        } else if (normalized.startsWith('00')) {
            normalized = normalized.substring(2);
        }
        
        if (normalized.length >= 9 && normalized.length <= 11 && !normalized.startsWith('39')) {
            normalized = `39${normalized}`;
        }
        return normalized;
    };

    const handleAddNewHistoricalLead = async (e: React.FormEvent) => {
        e.preventDefault();
        setHistoricalError('');
        if (!client || !lead || !historicalService || !historicalValue || !onHistoricalLeadAdded) {
            setHistoricalError('Compila tutti i campi richiesti.');
            return;
        }

        setIsSubmittingHistorical(true);
        try {
            const identifyingData: Record<string, string> = {};
            if (lead.data.nome) identifyingData.nome = lead.data.nome;
            if (lead.data.cognome) identifyingData.cognome = lead.data.cognome;
            if (lead.data.telefono) identifyingData.telefono = lead.data.telefono;
            if (lead.data.mail) identifyingData.mail = lead.data.mail;
            if (lead.data.email) identifyingData.email = lead.data.email;

            const newLead = await ApiService.addHistoricalLead({
                clientId: client.id,
                originalLeadData: identifyingData,
                service: historicalService,
                value: Number(historicalValue),
                date: historicalDate,
                notes: historicalNotes,
            });

            onHistoricalLeadAdded(newLead);

            setHistoricalValue('');
            setHistoricalNotes('');
            setHistoricalDate(new Date().toISOString().split('T')[0]);

        } catch (error: any) {
            console.error("Error adding historical lead:", error);
            setHistoricalError(error.message || 'Si è verificato un errore.');
        } finally {
            setIsSubmittingHistorical(false);
        }
    };

    const handleDeleteHistorical = async (leadId: string) => {
        if (window.confirm("Sei sicuro di voler eliminare questo lavoro dallo storico? L'azione è irreversibile.")) {
            if (client && onHistoricalLeadDeleted) {
                try {
                    await ApiService.deleteLead(client.id, leadId);
                    onHistoricalLeadDeleted(leadId);
                } catch (error) {
                    console.error("Error deleting historical lead:", error);
                    alert("Impossibile eliminare l'elemento.");
                }
            }
        }
    };

    const whatsappNumber = normalizeForWhatsApp(lead?.data?.telefono);
    const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : '#';
    const leadEmail = lead.data.mail || lead.data.email;
    
    const technicalFields = ['ip_address', 'user_agent', '_is_historical'];
    const mainDataEntries = Object.entries(lead.data).filter(([key]) => !technicalFields.includes(key));
    const techDataEntries = Object.entries(lead.data).filter(([key]) => technicalFields.includes(key));
    const allSortedEntries = [...mainDataEntries, ...techDataEntries];
    
    const tabs = [
        { id: 'dati', label: 'Dati Forniti', icon: <Info size={16} className="mr-2" /> },
        { id: 'riepilogo', label: 'Riepilogo', icon: <Briefcase size={16} className="mr-2" /> },
        { id: 'genera', label: 'Genera Messaggio', icon: <Sparkles size={16} className="mr-2" /> },
        { 
            id: 'storico', 
            label: (
                <>
                  Storico
                  {historicalLeads && historicalLeads.length > 0 ? <span className="text-red-500 ml-0.5">*</span> : ''}
                </>
            ), 
            icon: <History size={16} className="mr-2" /> 
        },
        { id: 'note', label: 'Note', icon: <MessageCircle size={16} className="mr-2" /> },
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'dati':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 max-h-96 overflow-y-auto pr-2">
                        {allSortedEntries.map(([key, value]) => {
                             if (isFacchetti && key === 'targa') {
                                return (
                                    <div key={key} className="py-2 border-b border-slate-200/80 dark:border-slate-700/80">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{getFieldLabel(key)}</p>
                                        {isEditingTarga ? (
                                            <div className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="text"
                                                    value={editableTarga}
                                                    onChange={(e) => setEditableTarga(e.target.value)}
                                                    className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm focus:ring-primary-500 focus:border-primary-500"
                                                    autoFocus
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTarga(); if (e.key === 'Escape') setIsEditingTarga(false); }}
                                                />
                                                <button onClick={handleSaveTarga} disabled={isSavingTarga} className="p-1.5 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-md" aria-label="Salva targa">
                                                    {isSavingTarga ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                </button>
                                                <button onClick={() => setIsEditingTarga(false)} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-md" aria-label="Annulla modifica">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between min-w-0">
                                                <p className="font-semibold text-slate-800 dark:text-white break-words flex-grow">
                                                    {value || <span className="text-gray-500 font-normal italic">N/D</span>}
                                                </p>
                                                <div className="flex items-center ml-2 flex-shrink-0">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setEditableTarga(value || ''); setIsEditingTarga(true); }} 
                                                        title="Modifica targa"
                                                        className="p-1.5 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                                        aria-label="Modifica targa"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    {value && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleCopyTarga(); }} 
                                                            title="Copia targa"
                                                            className="p-1.5 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                                            aria-label="Copia targa"
                                                        >
                                                            {targaCopied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div key={key} className="py-2 border-b border-slate-200/80 dark:border-slate-700/80">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{getFieldLabel(key)}</p>
                                    <p className="font-semibold text-slate-800 dark:text-white break-words">
                                        {value || <span className="text-gray-500 font-normal italic">N/D</span>}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                );
            case 'riepilogo':
                return (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        <DetailRow
                            icon={<Database size={16} className="text-primary-500 dark:text-primary-400" />}
                            label={t('component_leadDetailModal.lead_id')}
                            value={lead.id}
                        />
                        {client && (
                            <DetailRow
                                icon={<Briefcase size={16} className="text-primary-500 dark:text-primary-400" />}
                                label={t('component_leadDetailModal.client_label')}
                                value={client.name}
                            />
                        )}
                        <DetailRow
                            icon={<Calendar size={16} className="text-primary-500 dark:text-primary-400" />}
                            label={t('component_leadDetailModal.reception_date')}
                            value={new Date(lead.created_at).toLocaleString('it-IT')}
                        />
                        <DetailRow
                            icon={<Tag size={16} className="text-primary-500 dark:text-primary-400" />}
                            label={t('component_leadDetailModal.service_label')}
                            value={lead.service || <span className="text-gray-500">{t('component_leadDetailModal.not_specified')}</span>}
                        />
                        <DetailRow
                            icon={<Info size={16} className="text-primary-500 dark:text-primary-400" />}
                            label={t('component_leadDetailModal.status_label')}
                            value={<span className={`px-2 py-1 text-xs font-bold rounded-full ${statusColors[lead.status]}`}>{t(`lead_status.${lead.status}`)}</span>}
                        />
                        <DetailRow
                            icon={<DollarSign size={16} className="text-primary-500 dark:text-primary-400" />}
                            label={t('component_leadDetailModal.value_label')}
                            value={lead.value ? `€ ${lead.value.toLocaleString('it-IT')}` : <span className="text-gray-500">{t('component_leadDetailModal.not_defined')}</span>}
                        />
                    </div>
                );
            case 'genera':
                return (
                    <div>
                        {lead.data.telefono && (
                            <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2">
                                    Contatta su WhatsApp
                                </h4>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <Phone size={16} className="text-gray-500 mr-2 flex-shrink-0" />
                                        <span className="font-mono text-slate-700 dark:text-gray-300">{lead.data.telefono}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button 
                                            onClick={handleCopyPhone} 
                                            title="Copia numero"
                                            className="p-2 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                        >
                                            {phoneCopied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                        </button>
                                        <a 
                                            href={whatsappUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            title="Chatta su WhatsApp"
                                            className="p-2 text-green-500 hover:bg-green-500/10 rounded-md"
                                        >
                                            <WhatsAppIcon className="w-5 h-5" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                         {leadEmail && (
                            <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2">
                                    Contatta via Email
                                </h4>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center min-w-0">
                                        <Mail size={16} className="text-gray-500 mr-2 flex-shrink-0" />
                                        <span className="font-mono text-slate-700 dark:text-gray-300 truncate" title={leadEmail}>{leadEmail}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button 
                                            onClick={handleCopyEmail} 
                                            title="Copia email"
                                            className="p-2 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                        >
                                            {emailCopied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                        </button>
                                        <a 
                                            href={`mailto:${leadEmail}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            title="Scrivi una mail"
                                            className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-md"
                                        >
                                            <Mail className="w-5 h-5" />
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2">
                                    Aggiungi Prezzo (Opzionale)
                                </h4>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                                    <input
                                        type="number"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        placeholder="Es. 150"
                                        className="w-full pl-7 pr-2 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                        aria-label="Prezzo da includere nel messaggio"
                                    />
                                </div>
                        </div>

                        {isFacchetti && tipoTagliando && (
                            <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2">
                                    Servizio Richiesto
                                </h4>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center min-w-0">
                                        <Tag size={16} className="text-gray-500 mr-2 flex-shrink-0" />
                                        <span className="font-mono text-slate-700 dark:text-gray-300 truncate" title={tipoTagliando}>{tipoTagliando}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button 
                                            onClick={handleCopyService} 
                                            title="Copia servizio"
                                            className="p-2 text-slate-500 dark:text-gray-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md"
                                        >
                                            {serviceCopied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {isFacchetti ? (
                            <fieldset className="mb-4">
                                <legend className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                                    {t('component_leadDetailModal.choose_template')}
                                </legend>
                                <div className="space-y-2">
                                    {Object.entries(MESSAGE_TEMPLATES).map(([key, { label }]) => (
                                        <label key={key} className="flex items-center space-x-3 p-3 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border border-slate-200 dark:border-slate-600">
                                            <input
                                                type="radio"
                                                name="template"
                                                value={key}
                                                checked={selectedTemplateKey === key}
                                                onChange={() => setSelectedTemplateKey(key)}
                                                className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-gray-300">{t(`component_leadDetailModal.template_labels.${key}`, label)}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">La generazione di messaggi automatici non è configurata per questo cliente.</p>
                        )}
                        
                        {isFacchetti && (
                             <div className="text-center mt-4">
                                <button 
                                    onClick={handleGenerateMessage} 
                                    disabled={isGenerating}
                                    className="inline-flex items-center justify-center bg-primary-600 text-white px-4 py-2 text-sm rounded-lg shadow hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin mr-2"/>
                                            Generazione in corso...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={16} className="mr-2" />
                                            Genera Messaggio
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {generationError && (
                            <p className="text-sm text-red-500 dark:text-red-400 mt-4 text-center">{generationError}</p>
                        )}
                        
                        {generatedMessage && (
                            <div className="relative mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                                <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-2">Messaggio Generato:</h4>
                                <textarea
                                    readOnly
                                    value={generatedMessage}
                                    className="w-full h-40 p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                    aria-label="Messaggio generato"
                                />
                                <button 
                                    onClick={handleCopyMessage} 
                                    className="absolute top-12 right-2 p-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md text-slate-600 dark:text-gray-300"
                                    title="Copia messaggio"
                                    aria-label="Copia messaggio"
                                >
                                    {messageCopied ? <Check size={16} className="text-green-500"/> : <Copy size={16} />}
                                </button>
                            </div>
                        )}
                    </div>
                );
            case 'storico':
                return (
                    <div>
                        {editingHistoricalLead && client && onHistoricalLeadUpdated ? (
                            <EditHistoricalLeadForm
                                lead={editingHistoricalLead}
                                client={client}
                                onSuccess={(updatedLead) => {
                                    onHistoricalLeadUpdated(updatedLead);
                                    setEditingHistoricalLead(null);
                                }}
                                onCancel={() => setEditingHistoricalLead(null)}
                            />
                        ) : (
                            <>
                                <div className="space-y-3 max-h-60 overflow-y-auto pr-2 mb-4">
                                    {historicalLeads && historicalLeads.length > 0 ? (
                                        historicalLeads.map(hLead => (
                                            <div key={hLead.id} className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm border border-slate-200 dark:border-slate-700/50 space-y-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="font-semibold text-slate-800 dark:text-white">{hLead.service || 'Servizio non specificato'}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(hLead.created_at).toLocaleString('it-IT')}</p>
                                                    </div>
                                                    <div className="flex items-center space-x-1 flex-shrink-0">
                                                        <button onClick={() => setEditingHistoricalLead(hLead)} className="p-1.5 text-gray-400 hover:text-primary-500 rounded-full" aria-label="Modifica"><Edit size={14} /></button>
                                                        <button onClick={() => handleDeleteHistorical(hLead.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full" aria-label="Elimina"><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                                                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${statusColors[hLead.status]}`}>{hLead.status}</span>
                                                    {hLead.value ? <p className="text-sm text-green-600 dark:text-green-400 font-bold">{hLead.value.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</p> : <span></span>}
                                                </div>
                                                {hLead.notes && hLead.notes.length > 0 && hLead.notes[0].content && (
                                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                                        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">Note:</p>
                                                        <p className="text-sm text-slate-700 dark:text-gray-300 whitespace-pre-wrap">
                                                            {hLead.notes[0].content}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 text-center py-4">Nessuno storico trovato per questo cliente.</p>
                                    )}
                                </div>
                                {onHistoricalLeadAdded && (
                                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                        <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-3">
                                            Aggiungi Lavoro Manualmente
                                        </h4>
                                        <form onSubmit={handleAddNewHistoricalLead} className="space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Servizio Effettuato</label>
                                                    <select value={historicalService} onChange={e => setHistoricalService(e.target.value)} required className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm">
                                                        <option value="" disabled>Seleziona...</option>
                                                        {client?.services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Valore (€)</label>
                                                    <input type="number" value={historicalValue} onChange={e => setHistoricalValue(e.target.value)} required placeholder="Es. 150" className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Data Intervento</label>
                                                <input type="date" value={historicalDate} onChange={e => setHistoricalDate(e.target.value)} required className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Note (Opzionale)</label>
                                                <textarea value={historicalNotes} onChange={e => setHistoricalNotes(e.target.value)} placeholder="Es. Cliente venuto di persona..." className="w-full h-20 p-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm" />
                                            </div>
                                            {historicalError && <p className="text-sm text-red-500 dark:text-red-400">{historicalError}</p>}
                                            <div className="text-right">
                                                <button type="submit" disabled={isSubmittingHistorical} className="bg-primary-600 text-white px-4 py-2 text-sm rounded-lg shadow hover:bg-primary-700 transition-colors disabled:opacity-50">
                                                    {isSubmittingHistorical ? 'Aggiungendo...' : 'Aggiungi Lavoro'}
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            case 'note':
                return (
                    <div>
                        {onAddNote && (
                            <form onSubmit={handleAddNote} className="mb-4">
                                <textarea
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder="Aggiungi una nuova nota..."
                                    className="w-full h-20 p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                    disabled={isSubmittingNote}
                                />
                                <div className="text-right mt-2">
                                    <button type="submit" disabled={isSubmittingNote || !newNote.trim()} className="bg-primary-600 text-white px-4 py-2 text-sm rounded-lg shadow hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isSubmittingNote ? 'Aggiungendo...' : 'Aggiungi Nota'}
                                    </button>
                                </div>
                            </form>
                        )}
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {lead.notes && lead.notes.length > 0 ? (
                                lead.notes.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(note => (
                                    <div key={note.id} className="bg-slate-100 dark:bg-slate-800 p-3 rounded-md text-sm border border-slate-200 dark:border-slate-700/50">
                                        {editingNoteId === note.id ? (
                                            <>
                                                <textarea
                                                    value={editingNoteContent}
                                                    onChange={(e) => setEditingNoteContent(e.target.value)}
                                                    className="w-full h-20 p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                                />
                                                <div className="flex items-center justify-end space-x-2 mt-2">
                                                    <button onClick={handleCancelEditNote} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-full" aria-label="Annulla modifica"><X size={16} /></button>
                                                    <button onClick={() => handleSaveNote(note.id)} className="p-2 text-primary-500 hover:text-primary-600 rounded-full" aria-label="Salva modifica"><Save size={16} /></button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start">
                                                    <p className="text-slate-700 dark:text-gray-300 whitespace-pre-wrap flex-grow">{note.content}</p>
                                                    {onUpdateNote && onDeleteNote && (
                                                        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                                                            <button onClick={() => handleStartEditNote(note)} className="p-1.5 text-gray-400 hover:text-primary-500 rounded-full" aria-label="Modifica nota"><Edit size={14} /></button>
                                                            <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full" aria-label="Elimina nota"><Trash2 size={14} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 text-right mt-1">{new Date(note.created_at).toLocaleString('it-IT')}</p>
                                            </>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 text-center py-4">Nessuna nota presente.</p>
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };


    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${t('component_leadDetailModal.title', { name: lead.data.nome || 'N/D' })}`}>
            <div className="border-b border-slate-200 dark:border-slate-700">
                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap flex items-center py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === tab.id
                                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                            }`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            
            <div className="py-6 min-h-[400px]">
                {renderTabContent()}
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                <button onClick={onClose} className="bg-slate-500 dark:bg-slate-600 text-white px-4 py-2 rounded-lg shadow hover:bg-slate-600 dark:hover:bg-slate-500 transition-colors">
                    {t('close')}
                </button>
            </div>
        </Modal>
    );
};

export default LeadDetailModal;