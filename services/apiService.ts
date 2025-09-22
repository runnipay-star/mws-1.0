import { supabase } from '../supabaseClient';
// FIX: Imported SavedForm type to be used in new API methods.
import type { User, Client, Lead, Note, AdSpend, Service, SavedForm, Notification } from '../types';

interface AddLeadOptions {
    clientId: string;
    leadData: Record<string, string>;
    service?: string;
    status?: Lead['status'];
    value?: number;
}

export class ApiService {
    
    private static unpackMwsSettings<T extends { services?: any, mws_fixed_fee?: number, mws_profit_percentage?: number }>(clientData: T): T {
        if (!clientData) {
            return clientData;
        }

        const clientWithSettings = { ...clientData };
        let rawServices = clientWithSettings.services;

        if (typeof rawServices === 'string') {
            try {
                rawServices = JSON.parse(rawServices);
            } catch (e) {
                console.error("Failed to parse services JSON for client:", (clientData as any).id);
                rawServices = [];
            }
        }
        
        const servicesArray = Array.isArray(rawServices) ? rawServices : [];

        const mwsSettings = servicesArray.find((s: any) => s && s.id === 'mws_settings');
        if (mwsSettings) {
            clientWithSettings.mws_fixed_fee = mwsSettings.mws_fixed_fee;
            clientWithSettings.mws_profit_percentage = mwsSettings.mws_profit_percentage;
        }

        clientWithSettings.services = servicesArray.filter((s: any) => s && s.id !== 'mws_settings');
        
        return clientWithSettings;
    }


    static async login(username: string, password?: string): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        if (error) {
            console.error("Login error:", error.message);
            return null;
        }
        
        if (data?.status === 'suspended') {
            throw new Error('This account has been suspended.');
        }

        if (data) {
            const { password, ...userWithoutPassword } = data;
            return userWithoutPassword as User;
        }

        return null;
    }

    static async getClients(): Promise<Client[]> {
        const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('*');

        if (clientsError) throw new Error(clientsError.message);

        const clientsWithData = await Promise.all(clientsData.map(async (client) => {
            const { data: leads } = await supabase.from('leads').select('*, notes(*)').eq('client_id', client.id).order('created_at', { ascending: false });
            const { data: adSpends } = await supabase.from('ad_spends').select('*').eq('client_id', client.id);
            
            const unpackedClient = ApiService.unpackMwsSettings(client);

            return {
                ...unpackedClient,
                leads: (leads || []) as Lead[],
                adSpends: (adSpends || []) as AdSpend[],
            };
        }));

        return clientsWithData as Client[];
    }

    static async getUsers(): Promise<User[]> {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw new Error(error.message);
        return data as User[];
    }

    static async getClientByUserId(userId: string): Promise<Client | null> {
        const { data: client, error } = await supabase
            .from('clients')
            .select('*')
            .eq('user_id', userId)
            .single();
            
        if (error || !client) {
             console.error("Error fetching client by user ID", error?.message);
             return null;
        }

        const [{data: leads}, {data: spends}] = await Promise.all([
             supabase.from('leads').select('*, notes(*)').eq('client_id', client.id).order('created_at', { ascending: false }),
             supabase.from('ad_spends').select('*').eq('client_id', client.id)
        ]);
        
        const unpackedClient = ApiService.unpackMwsSettings(client);

        return {
            ...unpackedClient,
            leads: (leads || []) as Lead[],
            adSpends: (spends || []) as AdSpend[],
        } as Client;
    }
    
    static async addClient(name: string, username: string, password: string, services: Omit<Service, 'id'>[]): Promise<Client> {
        // Check for existing username
        const { data: existingUser } = await supabase.from('users').select('id').eq('username', username).single();
        if (existingUser) throw new Error('Username already exists.');

        if (!password || password.trim().length === 0) {
            throw new Error('Password is required and cannot be empty.');
        }

        // 1. Insert user
        const { data: newUser, error: userError } = await supabase
            .from('users')
            .insert({ username, password, role: 'client', status: 'active' })
            .select()
            .single();
        
        if (userError) throw new Error(userError.message);

        // 2. Insert client
        const servicesWithIds = services.map(s => ({
            ...s,
            id: `service_${Date.now()}_${Math.random()}`,
            fields: s.fields.map(f => ({ ...f, id: `field_${Date.now()}_${Math.random()}` }))
        }));
        
        const { data: newClient, error: clientError } = await supabase
            .from('clients')
            .insert({ name, user_id: newUser.id, services: servicesWithIds })
            .select()
            .single();

        if (clientError) {
            // Rollback user creation if client fails
            await supabase.from('users').delete().eq('id', newUser.id);
            throw new Error(clientError.message);
        }

        return { ...newClient, leads: [], adSpends: [], services: newClient.services || [] } as Client;
    }

    static async updateClient(clientId: string, updates: Partial<Pick<Client, 'name' | 'services' | 'mws_fixed_fee' | 'mws_profit_percentage'>>): Promise<Client> {
        const { mws_fixed_fee, mws_profit_percentage, ...otherUpdates } = updates;
        const updatesForSupabase: Partial<Pick<Client, 'name' | 'services'>> = { ...otherUpdates };

        const mwsSettingsProvided = mws_fixed_fee !== undefined || mws_profit_percentage !== undefined;

        if (mwsSettingsProvided || updates.services) {
            const { data: currentClientData, error: fetchError } = await supabase
                .from('clients')
                .select('services')
                .eq('id', clientId)
                .single();

            if (fetchError) throw new Error(fetchError.message);

            let currentServices = currentClientData.services || [];
            if (typeof currentServices === 'string') {
                try {
                    currentServices = JSON.parse(currentServices);
                } catch (e) {
                    currentServices = [];
                }
            }

            let userServices = Array.isArray(currentServices) ? currentServices.filter((s: any) => s && s.id !== 'mws_settings') : [];
            let mwsSettings = Array.isArray(currentServices) ? currentServices.find((s: any) => s && s.id === 'mws_settings') : undefined;
            if (!mwsSettings) {
                mwsSettings = { id: 'mws_settings', name: '_mws_settings' };
            }

            if (updates.services) {
                userServices = updates.services;
            }

            if (mwsSettingsProvided) {
                if (mws_fixed_fee !== undefined) (mwsSettings as any).mws_fixed_fee = mws_fixed_fee;
                if (mws_profit_percentage !== undefined) (mwsSettings as any).mws_profit_percentage = mws_profit_percentage;
            }
            
            updatesForSupabase.services = [...userServices, mwsSettings];
        }

        if (updatesForSupabase.services) {
            const updatedServicesWithIds = updatesForSupabase.services.map(s => ({
                ...s,
                id: (s.id && !s.id.startsWith('new_')) ? s.id : (s.id === 'mws_settings' ? 'mws_settings' : `service_${Date.now()}_${Math.random()}`),
                fields: s.fields ? s.fields.map(f => ({
                    ...f,
                    id: (f.id && !f.id.startsWith('new_')) ? f.id : `field_${Date.now()}_${Math.random()}`
                })) : undefined
            }));
            updatesForSupabase.services = updatedServicesWithIds;
        }
        
        const { data, error } = await supabase
            .from('clients')
            .update(updatesForSupabase)
            .eq('id', clientId)
            .select()
            .single();

        if (error) throw new Error(error.message);
        
        const unpackedClient = ApiService.unpackMwsSettings(data);
        return { ...unpackedClient, leads: [], adSpends: [] } as Client;
    }
    
    static async deleteClient(clientId: string): Promise<void> {
        // Find user_id first to delete the user
        const { data: client, error: findError } = await supabase.from('clients').select('user_id').eq('id', clientId).single();
        if(findError) throw new Error(findError.message);
        if(!client) throw new Error("Client not found.");

        // ON DELETE CASCADE will handle deleting the client, leads, etc.
        const { error } = await supabase.from('users').delete().eq('id', client.user_id);
        if (error) throw new Error(error.message);
    }
    
    static async deleteClientByUserId(userId: string): Promise<void> {
        const { error } = await supabase.from('users').delete().eq('id', userId);
        if (error) throw new Error(error.message);
    }

    static async addLead({ clientId, leadData, service, status, value }: AddLeadOptions): Promise<Lead> {
        const leadToInsert = {
            client_id: clientId,
            data: leadData,
            service,
            status: status || 'Nuovo',
            value
        };
        const { data, error } = await supabase.from('leads').insert(leadToInsert).select().single();
        if (error) throw new Error(error.message);
        const newLead = data as Lead;
        
        // --- Create Notifications ---
        try {
            const { data: clientData } = await supabase.from('clients').select('user_id, name').eq('id', clientId).single();
            const { data: adminUser } = await supabase.from('users').select('id').eq('role', 'admin').single();

            if (clientData && adminUser) {
                const notificationsToInsert = [
                    // Notification for the client
                    {
                        user_id: clientData.user_id,
                        title: `Nuovo Lead Ricevuto!`,
                        message: `Hai ricevuto un nuovo lead: '${leadData.nome || 'N/D'}'. Clicca per vedere i dettagli.`,
                        lead_id: newLead.id,
                        client_id: clientId
                    },
                    // Notification for the admin
                    {
                        user_id: adminUser.id,
                        title: `Nuovo Lead per ${clientData.name}`,
                        message: `È stato registrato un nuovo lead '${leadData.nome || 'N/D'}' per il cliente '${clientData.name}'.`,
                        lead_id: newLead.id,
                        client_id: clientId
                    }
                ];
                
                await supabase.from('notifications').insert(notificationsToInsert);
            }
        } catch(notificationError) {
            console.error("Failed to create notifications:", notificationError);
            // Non-blocking error, so we just log it.
        }

        return newLead;
    }

    static async addHistoricalLead(
        options: {
            clientId: string;
            originalLeadData: Record<string, string>;
            service: string;
            value: number;
            date: string; // YYYY-MM-DD
            notes?: string;
        }
    ): Promise<Lead> {
        const { clientId, originalLeadData, service, value, date, notes } = options;
    
        const leadToInsert = {
            client_id: clientId,
            data: { ...originalLeadData, _is_historical: 'true' },
            service,
            status: 'Vinto' as const,
            value,
            created_at: new Date(date).toISOString(),
        };
    
        const { data: newLead, error: leadError } = await supabase
            .from('leads')
            .insert(leadToInsert)
            .select()
            .single();
        
        if (leadError) throw new Error(leadError.message);
    
        if (notes && notes.trim() !== '') {
            const { error: noteError } = await supabase
                .from('notes')
                .insert({ lead_id: newLead.id, content: notes });
    
            if (noteError) {
                console.error("Could not add note to historical lead:", noteError.message);
            }
        }
    
        const { data: finalLead, error: fetchError } = await supabase
            .from('leads')
            .select('*, notes(*)')
            .eq('id', newLead.id)
            .single();
    
        if (fetchError) throw new Error(fetchError.message);
    
        return finalLead as Lead;
    }

    static async updateHistoricalLead(
        leadId: string,
        updates: {
            service: string;
            value: number;
            date: string; // YYYY-MM-DD
            notes?: string;
        },
        existingNoteId?: string
    ): Promise<Lead> {
        const { service, value, date, notes } = updates;
    
        const leadUpdates = {
            service,
            value,
            created_at: new Date(date).toISOString(),
        };
    
        const { data: updatedLead, error: leadError } = await supabase
            .from('leads')
            .update(leadUpdates)
            .eq('id', leadId)
            .select()
            .single();
        
        if (leadError) throw new Error(leadError.message);
    
        // Handle notes. Check for undefined to distinguish from empty string.
        if (notes !== undefined) {
            if (notes.trim() !== '') { // If notes has content
                if (existingNoteId) {
                    // Update existing note
                    const { error: noteError } = await supabase
                        .from('notes')
                        .update({ content: notes })
                        .eq('id', existingNoteId);
                    if (noteError) console.warn("Could not update note:", noteError.message);
                } else {
                    // Add new note
                    const { error: noteError } = await supabase
                        .from('notes')
                        .insert({ lead_id: leadId, content: notes });
                    if (noteError) console.warn("Could not add note:", noteError.message);
                }
            } else if (existingNoteId) { // If notes is empty string and there was a note
                // Delete note if content is cleared
                const { error: noteError } = await supabase
                    .from('notes')
                    .delete()
                    .eq('id', existingNoteId);
                if (noteError) console.warn("Could not delete note:", noteError.message);
            }
        }
    
        const { data: finalLead, error: fetchError } = await supabase
            .from('leads')
            .select('*, notes(*)')
            .eq('id', updatedLead.id)
            .single();
    
        if (fetchError) throw new Error(fetchError.message);
    
        return finalLead as Lead;
    }

    static async updateLead(clientId: string, leadId: string, updates: Partial<Lead>): Promise<Lead> {
        // We don't need clientId for Supabase update, but keep it for consistency
        const { data, error } = await supabase.from('leads').update(updates).eq('id', leadId).select().single();
        if (error) throw new Error(error.message);
        return data as Lead;
    }

    static async deleteLead(clientId: string, leadId: string): Promise<void> {
        const { error } = await supabase.from('leads').delete().eq('id', leadId);
        if (error) throw new Error(error.message);
    }

    static async deleteMultipleLeads(leadsToDelete: {clientId: string, leadId: string}[]): Promise<void> {
        const leadIds = leadsToDelete.map(l => l.leadId);
        const { error } = await supabase.from('leads').delete().in('id', leadIds);
        if (error) throw new Error(error.message);
    }
    
    static async addNoteToLead(clientId: string, leadId: string, noteContent: string): Promise<Lead> {
        const { error } = await supabase.from('notes').insert({ lead_id: leadId, content: noteContent });
        if (error) throw new Error(error.message);
        
        // Fetch the lead again with the new note
        const { data: updatedLeadData, error: leadError } = await supabase
            .from('leads')
            .select('*, notes(*)')
            .eq('id', leadId)
            .single();
        if(leadError) throw new Error(leadError.message);
        
        return updatedLeadData as Lead;
    }

    static async updateNote(noteId: string, content: string): Promise<void> {
        const { error } = await supabase
            .from('notes')
            .update({ content })
            .eq('id', noteId);
        if (error) throw new Error(error.message);
    }

    static async deleteNote(noteId: string): Promise<void> {
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId);
        if (error) throw new Error(error.message);
    }

    static async getUserById(userId: string): Promise<User | null> {
        const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
        if (error) return null;
        return data as User;
    }

    static async updateUser(userId: string, updates: Partial<Pick<User, 'username' | 'password' | 'email' | 'phone'>>, currentPassword?: string): Promise<User> {
        if (currentPassword) {
            const { data: user, error } = await supabase.from('users').select('password').eq('id', userId).single();
            if (error || !user || user.password !== currentPassword) {
                throw new Error('The current password is not correct.');
            }
        }
        
        if (updates.username) {
             const { data: existing, error } = await supabase.from('users').select('id').eq('username', updates.username).not('id', 'eq', userId).single();
             if(existing) throw new Error('Username already exists.');
        }

        if (updates.password === '' || updates.password === null || updates.password === undefined) {
            delete updates.password;
        }

        const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (updateError) throw new Error(updateError.message);

        const { password, ...userWithoutPassword } = updatedUser;
        return userWithoutPassword as User;
    }
    
    static async updateUserStatus(userId: string, status: User['status']): Promise<User> {
        const { data, error } = await supabase.from('users').update({ status }).eq('id', userId).select().single();
        if(error) throw new Error(error.message);
        const { password, ...userWithoutPassword } = data;
        return userWithoutPassword as User;
    }

    // --- Ad Spend Methods ---
    static async addAdSpend(clientId: string, spendData: Omit<AdSpend, 'id' | 'client_id' | 'created_at'>): Promise<AdSpend> {
        const { data, error } = await supabase
            .from('ad_spends')
            .insert({ client_id: clientId, ...spendData })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data as AdSpend;
    }

    static async updateAdSpend(clientId: string, spendId: string, updates: Partial<Omit<AdSpend, 'id'>>): Promise<AdSpend> {
        const { data, error } = await supabase.from('ad_spends').update(updates).eq('id', spendId).select().single();
        if(error) throw new Error(error.message);
        return data as AdSpend;
    }

    static async deleteAdSpend(clientId: string, spendId: string): Promise<void> {
        const { error } = await supabase.from('ad_spends').delete().eq('id', spendId);
        if(error) throw new Error(error.message);
    }

    static async deleteMultipleAdSpends(clientId: string, spendIds: string[]): Promise<void> {
        if (spendIds.length === 0) return;
        const { error } = await supabase.from('ad_spends').delete().in('id', spendIds);
        if (error) throw new Error(error.message);
    }

    // --- Saved Form Methods ---
    static async getForms(): Promise<SavedForm[]> {
        const { data, error } = await supabase.from('saved_forms').select('*');
        if (error) throw new Error(error.message);
        return data as SavedForm[];
    }

    static async saveForm(form: Omit<SavedForm, 'id' | 'created_at'>): Promise<SavedForm> {
        const { data, error } = await supabase
            .from('saved_forms')
            .insert(form)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data as SavedForm;
    }

    static async updateForm(formId: string, updates: Partial<Omit<SavedForm, 'id' | 'created_at'>>): Promise<SavedForm> {
        const { data, error } = await supabase
            .from('saved_forms')
            .update(updates)
            .eq('id', formId)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data as SavedForm;
    }

    static async deleteForm(formId: string): Promise<void> {
        const { error } = await supabase.from('saved_forms').delete().eq('id', formId);
        if (error) throw new Error(error.message);
    }

    // --- Notification Methods ---
    static async getNotificationsForUser(userId: string, limit?: number): Promise<Notification[]> {
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (limit) {
            query = query.limit(limit);
        }
        
        const { data, error } = await query;
        
        if (error) throw new Error(error.message);
        return data as Notification[];
    }

    static async markNotificationAsRead(notificationId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);
        
        if (error) throw new Error(error.message);
    }

    static async markAllNotificationsAsRead(userId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false);

        if (error) throw new Error(error.message);
    }

    static async sendCustomNotification(userIds: string[], title: string, message: string): Promise<void> {
        if (!userIds || userIds.length === 0 || !message.trim() || !title.trim()) {
            throw new Error("User IDs, title, and message are required.");
        }

        const notificationsToInsert = userIds.map(userId => ({
            user_id: userId,
            title: title.trim(),
            message: message.trim(),
            read: false,
        }));

        const { error } = await supabase.from('notifications').insert(notificationsToInsert);
        if (error) {
            throw new Error(error.message);
        }
    }
    
    static async getSentNotifications(): Promise<Notification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .is('lead_id', null)
            .not('title', 'is', null)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(error.message);
        }

        // Group notifications by title, message, and a 1-minute time window to represent a "batch"
        const grouped = new Map<string, Notification>();
        const notifications = data || [];

        for (const notification of notifications) {
            const date = new Date(notification.created_at);
            const timeKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
            const groupKey = `${notification.title}|${notification.message}|${timeKey}`;
    
            if (!grouped.has(groupKey)) {
                grouped.set(groupKey, notification); // Store the first notification as a representative for the group
            }
        }
        
        return Array.from(grouped.values());
    }

    static async updateSentNotification(originalNotification: Notification, newTitle: string, newMessage: string): Promise<void> {
        const { title, message, created_at } = originalNotification;
    
        const date = new Date(created_at);
        const startTime = new Date(date.getTime());
        startTime.setUTCSeconds(0, 0);
        const endTime = new Date(date.getTime());
        endTime.setUTCSeconds(59, 999);
    
        // 1. Identify the original batch and get recipient IDs
        const { data: originalBatch, error: fetchError } = await supabase
            .from('notifications')
            .select('user_id')
            .is('lead_id', null)
            .eq('title', title)
            .eq('message', message)
            .gte('created_at', startTime.toISOString())
            .lte('created_at', endTime.toISOString());
    
        if (fetchError) {
            throw new Error(`Could not retrieve original notifications: ${fetchError.message}`);
        }
    
        if (!originalBatch || originalBatch.length === 0) {
            console.warn("No notifications found for the group to update.");
            return;
        }
    
        const recipientUserIds = [...new Set(originalBatch.map(n => n.user_id))];
    
        // 2. Delete the original batch
        const { error: deleteError } = await supabase
            .from('notifications')
            .delete()
            .is('lead_id', null)
            .eq('title', title)
            .eq('message', message)
            .gte('created_at', startTime.toISOString())
            .lte('created_at', endTime.toISOString());
    
        if (deleteError) {
            throw new Error(`Could not delete original notifications: ${deleteError.message}`);
        }
    
        // 3. Create and re-send the new batch
        if (recipientUserIds.length > 0) {
            const notificationsToInsert = recipientUserIds.map(userId => ({
                user_id: userId,
                title: newTitle.trim(),
                message: newMessage.trim(),
                read: false,
            }));
            
            const { error: insertError } = await supabase.from('notifications').insert(notificationsToInsert);
            if (insertError) {
                throw new Error(`Could not resend new notifications: ${insertError.message}`);
            }
        }
    }

    static async deleteSentNotification(notificationToDelete: Notification): Promise<void> {
        const { title, message, created_at } = notificationToDelete;
    
        const date = new Date(created_at);
        const startTime = new Date(date.getTime());
        startTime.setUTCSeconds(0, 0);
        const endTime = new Date(date.getTime());
        endTime.setUTCSeconds(59, 999);

        const { error } = await supabase
            .from('notifications')
            .delete()
            .is('lead_id', null)
            .eq('title', title)
            .eq('message', message)
            .gte('created_at', startTime.toISOString())
            .lte('created_at', endTime.toISOString());

        if (error) {
            throw new Error(error.message);
        }
    }
}