import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import Native from '../../modules/reminder-native';
import { Screen, Card, T, Row, EmptyState, Fab, Loading, Badge } from '../components/ui';
import FormSheet from '../components/FormSheet';
import { useQuery } from '../hooks/useQuery';
import { documentsRepository as repo } from '../database/repositories';
import { fmtDateTime } from '../utils/date';
import { confirm, showError, toast } from '../utils/ui';

const CATS = ['ID proof', 'College', 'Certificates', 'Finance', 'Medical', 'Other'].map((c) => ({ label: c, value: c }));
const FIELDS = [
  { key: 'title', label: 'Title', required: true, placeholder: 'e.g. Aadhaar card' },
  { key: 'category', label: 'Category', type: 'select', options: CATS },
];
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Documents are encrypted (AES-256-GCM, Android Keystore key) into app-private storage by the native module. */
export default function VaultScreen() {
  const { data, loading } = useQuery(() => repo.list(), [], []);
  const [picked, setPicked] = useState(null);
  const [editing, setEditing] = useState(null);
  const supported = !!Native?.vaultEncrypt;

  useEffect(() => { Native?.vaultClearTemp?.().catch(() => {}); return () => { Native?.vaultClearTemp?.().catch(() => {}); }; }, []);

  const pick = async () => {
    if (!supported) return showError(new Error('The encrypted vault needs the installed Android app.'));
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
      if (res.canceled) return;
      const a = res.assets[0];
      setPicked(a);
      setEditing({ title: a.name.replace(/\.[^.]+$/, ''), category: 'Other' });
    } catch (e) { showError(e); }
  };

  const store = async (v) => {
    const stored = await Native.vaultEncrypt(picked.uri);
    try {
      await repo.insert({ title: v.title.trim(), category: v.category || 'Other', stored_name: stored, display_name: picked.name, mime: picked.mimeType || null, size: picked.size || null });
    } catch (e) { await Native.vaultDelete(stored); throw e; }
    try { new File(picked.uri).delete(); } catch (e) { /* cache copy is cleaned by the OS anyway */ }
    toast('Encrypted and saved');
  };

  const open = async (d) => {
    try {
      const path = await Native.vaultDecrypt(d.stored_name, d.display_name);
      if (!(await Sharing.isAvailableAsync())) throw new Error('No app available to open this document.');
      await Sharing.shareAsync(`file://${path}`, { mimeType: d.mime || undefined, dialogTitle: d.title });
    } catch (e) { showError(e, 'Cannot open document'); }
  };

  const remove = async (d) => {
    if (!(await confirm('Delete document?', `"${d.title}" will be permanently deleted from this phone.`, { destructive: true, confirmText: 'Delete' }))) return;
    try { await Native.vaultDelete(d.stored_name); await repo.remove(d.id); } catch (e) { showError(e); }
  };

  return (
    <Screen title="Document locker" subtitle="Encrypted, app-private storage" fab={<Fab onPress={pick} icon="lock-closed" label="Add document" />}>
      <Card style={{ marginBottom: 12 }}>
        <T v="small" muted>Files are encrypted with AES-256-GCM using a key held in the Android Keystore and stored in the app's private folder. Only the title and category are kept in the database. Opening a document decrypts a temporary copy that is deleted when you leave this screen.</T>
      </Card>
      {loading && !data.length ? <Loading /> : !data.length ? (
        <EmptyState icon="lock-closed-outline" title="Your locker is empty" text="Add ID proofs, certificates or receipts." action="Add document" onAction={pick} />
      ) : (
        <Card pad={false} style={{ paddingHorizontal: 16 }}>
          {data.map((d) => (
            <Row key={d.id} icon="document-lock-outline" title={d.title} subtitle={`${d.category} · ${d.size ? size(d.size) : ''} · ${fmtDateTime(d.created_at)}`}
              onPress={() => open(d)} onLongPress={() => remove(d)} />
          ))}
        </Card>
      )}
      {data.length ? <T v="small" faint style={{ textAlign: 'center', marginTop: 10 }}>Tap to open · long-press to delete</T> : null}
      <FormSheet visible={!!editing} title="Add to locker" fields={FIELDS} initial={editing || {}} submitLabel="Encrypt & save" onSubmit={store} onClose={() => { setEditing(null); setPicked(null); }} />
    </Screen>
  );
}
