import React, { useState, useEffect } from 'react';
import { safeLocalStorage } from '../utils/safeStorage.ts';
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  X,
  MessageSquare,
  Sliders,
  CheckCircle2,
  Package,
  ChevronDown,
  ChevronUp,
  Send,
  DollarSign,
  Truck,
  CreditCard,
  Hash,
  Phone,
  Boxes,
  CheckSquare,
  Download,
  Image as ImageIcon,
  Type,
  Tag as TagIcon,
  Save,
  Database,
  ExternalLink,
  Plus,
  Trash2,
  MapPin,
  Loader2,
  Globe,
  Star,
  UploadCloud,
} from 'lucide-react';
import { InventoryItem, ProductMarketingCopy } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { downloadImage, downloadMultipleImages, copyImageToClipboard } from '../utils/image-drag-copy.ts';
import { ProductWebImagePicker } from './ProductWebImagePicker.tsx';
import { getPublicStoreUrl, getPublicProductUrl } from '../utils/storeUrls.ts';

/**
 * Strips trailing hashtags or tag lists from universal post text so the universal
 * copy finishes cleanly after shipping/payment details, keeping tags only in the tags panel.
 */
function stripTrailingTags(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:Tags|Etiquetas|Hashtags)\s*:[^\n]*$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:#[\w\u00C0-\u017F\d_-]+(?:\s+|$))+$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:Tags|Etiquetas|Hashtags)\s*:[^\n]*$/gi, '');
  cleaned = cleaned.replace(/(\r?\n)+\s*(?:#[\w\u00C0-\u017F\d_-]+(?:\s+|$))+$/gi, '');
  return cleaned.trim();
}

interface ProductMarketingCopyModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onItemUpdated?: (updatedItem: InventoryItem) => void;
  currency?: string;
}

export const ProductMarketingCopyModal: React.FC<ProductMarketingCopyModalProps> = ({
  item: initialItem,
  onClose,
  onItemUpdated,
  currency = 'USD',
}) => {
  const { authFetch } = useAuth();
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(initialItem);
  const [loading, setLoading] = useState<boolean>(false);
  const [savingDb, setSavingDb] = useState<boolean>(false);
  const [copyData, setCopyData] = useState<ProductMarketingCopy | null>(null);
  const [tone, setTone] = useState<'persuasive' | 'direct' | 'urgency' | 'exclusive'>('persuasive');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [cityOrRegion, setCityOrRegion] = useState<string>('Envíos a todo el país');
  const [whatsappContact, setWhatsappContact] = useState<string>('');
  const [storeAddress, setStoreAddress] = useState<string>('');
  const [paymentTitlesInput, setPaymentTitlesInput] = useState<string>(
    'Transferencia Bancaria, Banco Pichincha, Banco Guayaquil, Deuna, Efectivo'
  );
  const [shippingCompaniesInput, setShippingCompaniesInput] = useState<string>(
    'Servientrega, LaarCourier, Cooperativas de Transporte, Entregas a Domicilio'
  );

  // Check list toggles requested by user
  const [showStock, setShowStock] = useState<boolean>(true);
  const [showPhone, setShowPhone] = useState<boolean>(true);
  const [showSku, setShowSku] = useState<boolean>(true);
  const [showWebsite, setShowWebsite] = useState<boolean>(true);

  // Dynamic store link derived from 'Compartir Tienda'
  const dynamicStoreUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    if (currentItem?.id) {
      return getPublicProductUrl(currentItem.id);
    }
    return getPublicStoreUrl();
  }, [currentItem?.id]);

  // Delete confirmation state
  const [isDeletingCopy, setIsDeletingCopy] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Web Image Picker state
  const [showWebImagePicker, setShowWebImagePicker] = useState<boolean>(false);

  // Individual editable fields
  const [titleField, setTitleField] = useState<string>('');
  const [priceField, setPriceField] = useState<string>('');
  const [skuField, setSkuField] = useState<string>('');
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [universalText, setUniversalText] = useState<string>('');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'individual' | 'universal'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync current item safely if initialItem prop changes (avoid wiping out newly added images upon polling)
  useEffect(() => {
    if (initialItem) {
      setCurrentItem((prev) => {
        if (!prev || prev.id !== initialItem.id) {
          return initialItem;
        }
        // Si es el mismo item, preservar fotos agregadas
        const prevImages = Array.isArray(prev.images) && prev.images.length > 0 ? prev.images : [];
        const incomingImages = Array.isArray(initialItem.images) && initialItem.images.length > 0 ? initialItem.images : [];

        const getAttrImages = (obj: any): string[] => {
          try {
            const parsed = typeof obj.extractedAttributes === 'string' ? JSON.parse(obj.extractedAttributes) : obj.extractedAttributes;
            return Array.isArray(parsed?.images) ? parsed.images : [];
          } catch {
            return [];
          }
        };
        const prevAttrImgs = getAttrImages(prev);
        const inAttrImgs = getAttrImages(initialItem);

        const allPrev = [...new Set([...prevImages, ...prevAttrImgs])].filter(Boolean);
        const allIn = [...new Set([...incomingImages, ...inAttrImgs])].filter(Boolean);

        const mergedImages = allIn.length >= allPrev.length ? allIn : allPrev;

        return {
          ...initialItem,
          ...prev,
          images: mergedImages.length > 0 ? mergedImages : (incomingImages.length > 0 ? incomingImages : prevImages),
          imageUrl: (mergedImages[0] || prev.imageUrl || initialItem.imageUrl),
          extractedAttributes: prev.extractedAttributes || initialItem.extractedAttributes,
        };
      });
    }
  }, [initialItem?.id, initialItem?.updatedAt]);

  const item = currentItem;

  // Extract all photos of this product comprehensively (never miss newly appended photos)
  let productPhotos: string[] = [];
  if (item) {
    const list: string[] = [];
    if (item.images && Array.isArray(item.images)) {
      list.push(...item.images.filter(Boolean));
    }
    try {
      const parsedAttrs =
        typeof item.extractedAttributes === 'string'
          ? JSON.parse(item.extractedAttributes)
          : item.extractedAttributes;
      if (parsedAttrs?.images && Array.isArray(parsedAttrs.images)) {
        list.push(...parsedAttrs.images.filter(Boolean));
      }
    } catch {}
    if (item.imageUrl) {
      list.push(item.imageUrl);
    }
    // Deduplicate maintaining order
    productPhotos = Array.from(new Set(list));
  }

  // Helper toggle functions with immediate local persistence
  const handleToggleStock = (checked: boolean) => {
    setShowStock(checked);
    if (item) {
      safeLocalStorage.setItem(`copy_pref_show_stock_${item.id}`, String(checked));
    }
    safeLocalStorage.setItem('copy_pref_show_stock_global', String(checked));
  };

  const handleTogglePhone = (checked: boolean) => {
    setShowPhone(checked);
    if (item) {
      safeLocalStorage.setItem(`copy_pref_show_phone_${item.id}`, String(checked));
    }
    safeLocalStorage.setItem('copy_pref_show_phone_global', String(checked));
  };

  const handleToggleSku = (checked: boolean) => {
    setShowSku(checked);
    if (item) {
      safeLocalStorage.setItem(`copy_pref_show_sku_${item.id}`, String(checked));
    }
    safeLocalStorage.setItem('copy_pref_show_sku_global', String(checked));
  };

  const handleToggleWebsite = (checked: boolean) => {
    setShowWebsite(checked);
    if (item) {
      safeLocalStorage.setItem(`copy_pref_show_web_${item.id}`, String(checked));
    }
    safeLocalStorage.setItem('copy_pref_show_web_global', String(checked));
  };

  const handleChangeTone = (newTone: 'persuasive' | 'direct' | 'urgency' | 'exclusive') => {
    setTone(newTone);
    safeLocalStorage.setItem('copy_pref_tone_global', newTone);
  };

  // Initialize form fields and load existing saved marketingCopy + remembered checklist state
  useEffect(() => {
    if (item) {
      const initialPrice = item.salePrice ? String(item.salePrice) : '';
      setCustomPrice(initialPrice);
      setCopiedKey(null);

      // Check if item already has marketingCopy saved in database
      let existingCopy: ProductMarketingCopy | null = null;
      if (item.marketingCopy) {
        try {
          existingCopy =
            typeof item.marketingCopy === 'string'
              ? JSON.parse(item.marketingCopy)
              : item.marketingCopy;
        } catch {
          if (typeof item.marketingCopy === 'string' && item.marketingCopy.trim().length > 0) {
            existingCopy = {
              universalDescription: item.marketingCopy,
              title: item.name,
              price: `$${initialPrice}`,
              sku: item.sku,
              tags: typeof item.tags === 'string' ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
            };
          }
        }
      }

      // Check for remembered checklist states and options
      let rememberedShowStock = true;
      let rememberedShowPhone = true;
      let rememberedShowSku = true;
      let rememberedShowWebsite = true;
      let rememberedTone: 'persuasive' | 'direct' | 'urgency' | 'exclusive' = 'persuasive';

      if (existingCopy) {
        setCopyData(existingCopy);
        setTitleField(existingCopy.title || item.name || '');
        setPriceField(existingCopy.price || (initialPrice ? `$${initialPrice}` : ''));
        setSkuField(existingCopy.sku || item.sku || '');
        const cleanUniversal = stripTrailingTags(existingCopy.universalDescription || existingCopy.allInOne || '');
        setUniversalText(cleanUniversal);
        
        let initialTags: string[] = [];
        if (Array.isArray(existingCopy.tags) && existingCopy.tags.length > 0) {
          initialTags = existingCopy.tags;
        } else if (typeof item.tags === 'string') {
          initialTags = item.tags.split(',').map((t) => t.trim()).filter(Boolean);
        }
        setTagsList(initialTags);
        setLastSavedTime(existingCopy.savedAt || item.updatedAt || null);

        // Restore checklist states from existing copy options or properties
        if (existingCopy.options) {
          if (existingCopy.options.showStock !== undefined) rememberedShowStock = Boolean(existingCopy.options.showStock);
          if (existingCopy.options.showPhone !== undefined) rememberedShowPhone = Boolean(existingCopy.options.showPhone);
          if (existingCopy.options.showSku !== undefined) rememberedShowSku = Boolean(existingCopy.options.showSku);
          if (existingCopy.options.showWebsite !== undefined) rememberedShowWebsite = Boolean(existingCopy.options.showWebsite);
          if (existingCopy.options.tone && ['persuasive', 'direct', 'urgency', 'exclusive'].includes(existingCopy.options.tone)) {
            rememberedTone = existingCopy.options.tone as any;
          }
          if (existingCopy.options.cityOrRegion) setCityOrRegion(existingCopy.options.cityOrRegion);
          if (existingCopy.options.whatsappContact) setWhatsappContact(existingCopy.options.whatsappContact);
          if (existingCopy.options.storeAddress) setStoreAddress(existingCopy.options.storeAddress);
          if (existingCopy.options.paymentTitlesInput) setPaymentTitlesInput(existingCopy.options.paymentTitlesInput);
          if (existingCopy.options.shippingCompaniesInput) setShippingCompaniesInput(existingCopy.options.shippingCompaniesInput);
        } else {
          if (existingCopy.showStock !== undefined) rememberedShowStock = Boolean(existingCopy.showStock);
          if (existingCopy.showPhone !== undefined) rememberedShowPhone = Boolean(existingCopy.showPhone);
          if (existingCopy.showSku !== undefined) rememberedShowSku = Boolean(existingCopy.showSku);
          if (existingCopy.showWebsite !== undefined) rememberedShowWebsite = Boolean(existingCopy.showWebsite);
        }
      } else {
        setCopyData(null);
        setTitleField(item.name || '');
        setPriceField(initialPrice ? `$${initialPrice}` : '');
        setSkuField(item.sku || '');
        setUniversalText('');
        const itemTags = typeof item.tags === 'string' ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
        setTagsList(itemTags);
        setLastSavedTime(null);

        // Check local storage preferences for checklist
        const savedStockPref = safeLocalStorage.getItem(`copy_pref_show_stock_${item.id}`) ?? safeLocalStorage.getItem('copy_pref_show_stock_global');
        if (savedStockPref !== null) rememberedShowStock = savedStockPref === 'true';

        const savedPhonePref = safeLocalStorage.getItem(`copy_pref_show_phone_${item.id}`) ?? safeLocalStorage.getItem('copy_pref_show_phone_global');
        if (savedPhonePref !== null) rememberedShowPhone = savedPhonePref === 'true';

        const savedSkuPref = safeLocalStorage.getItem(`copy_pref_show_sku_${item.id}`) ?? safeLocalStorage.getItem('copy_pref_show_sku_global');
        if (savedSkuPref !== null) rememberedShowSku = savedSkuPref === 'true';

        const savedWebPref = safeLocalStorage.getItem(`copy_pref_show_web_${item.id}`) ?? safeLocalStorage.getItem('copy_pref_show_web_global');
        if (savedWebPref !== null) rememberedShowWebsite = savedWebPref === 'true';

        const savedTonePref = safeLocalStorage.getItem('copy_pref_tone_global');
        if (savedTonePref && ['persuasive', 'direct', 'urgency', 'exclusive'].includes(savedTonePref)) {
          rememberedTone = savedTonePref as any;
        }
      }

      setShowStock(rememberedShowStock);
      setShowPhone(rememberedShowPhone);
      setShowSku(rememberedShowSku);
      setShowWebsite(rememberedShowWebsite);
      setTone(rememberedTone);

      // Load store configuration for defaults
      authFetch('/api/store/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((config) => {
          if (config) {
            if (config.whatsappNumber && !whatsappContact) {
              setWhatsappContact(config.whatsappNumber);
            }
            if (config.address) {
              setStoreAddress((prev) => (prev ? prev : (config.address || '')));
            }
            if (config.paymentLogos) {
              try {
                const payments = typeof config.paymentLogos === 'string' ? JSON.parse(config.paymentLogos) : config.paymentLogos;
                if (Array.isArray(payments) && payments.length > 0) {
                  const activeTitles = payments
                    .filter((p: any) => p.active !== false && p.name)
                    .map((p: any) => String(p.name).trim());
                  if (activeTitles.length > 0) {
                    setPaymentTitlesInput(activeTitles.join(', '));
                  }
                }
              } catch {}
            }
            if (config.courierLogos) {
              try {
                const couriers = typeof config.courierLogos === 'string' ? JSON.parse(config.courierLogos) : config.courierLogos;
                if (Array.isArray(couriers) && couriers.length > 0) {
                  const activeCouriers = couriers
                    .filter((c: any) => c.active !== false && c.name)
                    .map((c: any) => String(c.name).trim());
                  if (activeCouriers.length > 0) {
                    setShippingCompaniesInput(activeCouriers.join(', '));
                  }
                }
              } catch {}
            }
          }
        })
        .catch(() => {});
    }
  }, [item?.id]);

  if (!item) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const parsePaymentTitlesArray = () => {
    return paymentTitlesInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  };

  const parseShippingCompaniesArray = () => {
    return shippingCompaniesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleGenerate = async (selectedTone = tone) => {
    if (!item) return;
    setLoading(true);
    setCopiedKey(null);

    const paymentTitles = parsePaymentTitlesArray();
    const shippingCompanies = parseShippingCompaniesArray();

    try {
      const res = await authFetch(`/api/inventory/${item.id}/generate-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tone: selectedTone,
          customPrice: customPrice ? parseFloat(customPrice) : undefined,
          cityOrRegion: cityOrRegion || undefined,
          whatsappNumber: whatsappContact || undefined,
          storeAddress: storeAddress || undefined,
          websiteUrl: dynamicStoreUrl,
          paymentTitles,
          shippingCompanies,
          showStock,
          showPhone,
          showSku,
          showWebsite,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.copy) {
          const c = data.copy as ProductMarketingCopy;
          setCopyData(c);
          const singleDescription = stripTrailingTags(c.universalDescription || c.allInOne || '');
          setUniversalText(singleDescription);
          setTitleField(c.title || item.name || '');
          setPriceField(c.price || `$${customPrice || item.salePrice || '0'}`);
          setSkuField(c.sku || item.sku || '');
          const newTags = Array.isArray(c.tags) && c.tags.length > 0 ? c.tags : tagsList;
          setTagsList(newTags);
          const nowStr = new Date().toISOString();
          setLastSavedTime(nowStr);

          if (data.item && onItemUpdated) {
            onItemUpdated(data.item);
          }

          showToast('✨ ¡Publicación generada y guardada en BD!');
        }
      } else {
        throw new Error('Error en el servidor al generar con IA');
      }
    } catch (err) {
      console.warn('Fallback generating copy locally:', err);
      const priceVal = customPrice || item.salePrice || '0';
      const cleanDesc = (item.description || '').slice(0, 250);
      const paymentBullets = paymentTitles.map((t) => `• ${t}`).join('\n');
      const shippingBullets = shippingCompanies.map((c) => `• ${c}`).join('\n');
      const addressSectionFallback = storeAddress ? `\n\n📍 UBICACIÓN / DIRECCIÓN DE LA TIENDA:\n• ${storeAddress}` : '';
      const websiteSectionFallback = showWebsite && dynamicStoreUrl ? `\n\n🌐 TIENDA ONLINE / CATÁLOGO:\n• ${dynamicStoreUrl}` : '';

      const skuLine = showSku && item.sku ? `🏷️ CÓDIGO / SKU: ${item.sku}\n` : '';
      const stockLine = showStock ? `📊 DISPONIBILIDAD: ${item.stock ?? 1} unidades listas para entrega\n` : '';
      const contactLine = showPhone && whatsappContact
        ? `• Escríbenos por mensaje privado o al WhatsApp ${whatsappContact} para coordinar tu entrega hoy mismo.`
        : `• Escríbenos por mensaje privado para coordinar tu entrega hoy mismo.`;

      const fallbackUniversal = `🔥 ${item.name.toUpperCase()} 🔥

💰 PRECIO: $${priceVal} ${currency}
📦 ESTADO: 100% Nuevo en caja sellada / Garantizado
${skuLine}${stockLine}
✨ CARACTERÍSTICAS Y BENEFICIOS:
${cleanDesc ? `• ${cleanDesc}` : '• Producto nuevo de primera calidad, excelente durabilidad y alto rendimiento.'}
• Garantía de satisfacción y producto 100% original.
• Entrega rápida y confiable.

📲 PEDIDOS Y CONTACTO DIRECTO:
${contactLine}

💳 MÉTODOS DE PAGO:
${paymentBullets}

🚚 EMPRESAS DE ENVÍO / ENTREGAS:
${shippingBullets}${addressSectionFallback}${websiteSectionFallback}`.trim();

      const generatedTags = [
        item.category?.toLowerCase() || 'tienda',
        'marketplace',
        'oferta',
        'ventas',
        'comprasegura',
      ];

      const fallbackObj: ProductMarketingCopy = {
        title: item.name,
        price: `$${priceVal}`,
        sku: item.sku || '',
        tags: generatedTags,
        universalDescription: fallbackUniversal,
        allInOne: fallbackUniversal,
        paymentTitles,
        shippingCompanies,
        showStock,
        showPhone,
        showSku,
        showWebsite,
        websiteUrl: dynamicStoreUrl || undefined,
        options: {
          showStock,
          showPhone,
          showSku,
          showWebsite,
          websiteUrl: dynamicStoreUrl || undefined,
          tone: selectedTone,
          customPrice,
          cityOrRegion,
          whatsappContact,
          storeAddress,
          paymentTitlesInput,
          shippingCompaniesInput,
        },
        savedAt: new Date().toISOString(),
      };

      setCopyData(fallbackObj);
      setUniversalText(fallbackUniversal);
      setTitleField(item.name);
      setPriceField(`$${priceVal}`);
      setSkuField(item.sku || '');
      setTagsList(generatedTags);

      // Save fallback to DB
      handleSaveToDb(fallbackObj);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDb = async (customCopyPayload?: ProductMarketingCopy) => {
    if (!item) return;
    setSavingDb(true);
    try {
      const payload: ProductMarketingCopy = customCopyPayload || {
        title: titleField.trim() || item.name,
        price: priceField.trim() || `$${customPrice || item.salePrice || '0'}`,
        sku: skuField.trim() || item.sku || '',
        tags: tagsList,
        universalDescription: universalText,
        allInOne: universalText,
        paymentTitles: parsePaymentTitlesArray(),
        shippingCompanies: parseShippingCompaniesArray(),
        showStock,
        showPhone,
        showSku,
        showWebsite,
        websiteUrl: dynamicStoreUrl || undefined,
        options: {
          showStock,
          showPhone,
          showSku,
          showWebsite,
          websiteUrl: dynamicStoreUrl || undefined,
          tone,
          customPrice,
          cityOrRegion,
          whatsappContact,
          storeAddress,
          paymentTitlesInput,
          shippingCompaniesInput,
        },
        savedAt: new Date().toISOString(),
      };

      const res = await authFetch(`/api/inventory/${item.id}/marketing-copy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copy: payload }),
      });

      if (res.ok) {
        const data = await res.json();
        setCopyData(payload);
        const nowStr = new Date().toISOString();
        setLastSavedTime(nowStr);
        if (data.item && onItemUpdated) {
          onItemUpdated(data.item);
        }
        showToast('💾 ¡Información guardada en la base de datos!');
      } else {
        throw new Error('Error al guardar en base de datos');
      }
    } catch (err: any) {
      console.error('Error saving to DB:', err);
      showToast('⚠️ No se pudo guardar en la base de datos');
    } finally {
      setSavingDb(false);
    }
  };

  // Delete Marketing Copy from DB and reset state
  const handleDeleteMarketingCopy = async () => {
    if (!item) return;
    setIsDeletingCopy(true);
    try {
      const res = await authFetch(`/api/inventory/${item.id}/marketing-copy`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setCopyData(null);
        setUniversalText('');
        setLastSavedTime(null);
        setTitleField(item.name || '');
        setPriceField(item.salePrice ? `$${item.salePrice}` : '');
        setSkuField(item.sku || '');
        const itemTags = typeof item.tags === 'string' ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
        setTagsList(itemTags);
        setShowDeleteConfirm(false);
        if (data.item && onItemUpdated) {
          onItemUpdated(data.item);
        }
        showToast('🗑️ ¡Publicación de IA eliminada exitosamente!');
      } else {
        throw new Error('Error al eliminar');
      }
    } catch (err) {
      console.error('Error deleting marketing copy:', err);
      showToast('⚠️ No se pudo eliminar la publicación');
    } finally {
      setIsDeletingCopy(false);
    }
  };

  const copyToClipboard = async (text: string, keyName: string, label = 'Texto') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      showToast(`📋 ¡${label} copiado al portapapeles!`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === keyName ? null : prev));
      }, 2500);
    } catch (err) {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedKey(keyName);
      showToast(`📋 ¡${label} copiado al portapapeles!`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === keyName ? null : prev));
      }, 2500);
    }
  };

  const handleAddTag = () => {
    const trimmed = newTagInput.trim().replace(/^#/, '');
    if (trimmed && !tagsList.includes(trimmed)) {
      setTagsList([...tagsList, trimmed]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTagsList(tagsList.filter((t) => t !== tagToRemove));
  };

  const [downloadingAllPhotos, setDownloadingAllPhotos] = useState(false);
  const [downloadingPhotoIndex, setDownloadingPhotoIndex] = useState<number | null>(null);
  const [settingCoverIndex, setSettingCoverIndex] = useState<number | null>(null);
  const [removingPhotoIndex, setRemovingPhotoIndex] = useState<number | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isDeletingAllPhotos, setIsDeletingAllPhotos] = useState(false);
  const fileInputMarketingRef = React.useRef<HTMLInputElement>(null);

  // Helper to read & compress image files to base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1600;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
          } else {
            resolve(reader.result as string);
          }
        };
        img.onerror = () => resolve(reader.result as string);
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Direct upload photo(s) directly to database
  const handleDirectUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !item) return;

    setIsUploadingPhotos(true);
    showToast(`📤 Subiendo ${files.length} foto(s) directamente a la base de datos...`);
    try {
      const base64List: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const b64 = await readFileAsBase64(files[i]);
        if (b64) base64List.push(b64);
      }

      if (base64List.length === 0) {
        showToast('⚠️ No se pudieron procesar las imágenes seleccionadas');
        return;
      }

      const res = await authFetch(`/api/inventory/${item.id}/add-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: base64List,
          setAsCover: productPhotos.length === 0,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setCurrentItem(data.item);
          onItemUpdated?.(data.item);
          showToast(`✅ ${base64List.length} foto(s) guardada(s) directamente en la base de datos`);
        }
      } else {
        const err = await res.json();
        showToast(`⚠️ Error al guardar fotos: ${err.error || 'Fallo en el servidor'}`);
      }
    } catch (err) {
      console.error('Upload to database failed:', err);
      showToast('⚠️ Error al subir fotos a la base de datos');
    } finally {
      setIsUploadingPhotos(false);
      if (fileInputMarketingRef.current) fileInputMarketingRef.current.value = '';
    }
  };

  // Single button handler to delete all photos from database
  const handleDeleteAllPhotos = async () => {
    if (!item || productPhotos.length === 0 || isDeletingAllPhotos) return;

    setIsDeletingAllPhotos(true);
    showToast('🗑️ Eliminando fotos de la base de datos...');
    try {
      const res = await authFetch(`/api/inventory/${item.id}/delete-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setCurrentItem(data.item);
          onItemUpdated?.(data.item);
          showToast('✅ Fotos eliminadas de la base de datos');
        }
      } else {
        const err = await res.json();
        showToast(`⚠️ Error al eliminar fotos: ${err.error || 'Fallo en el servidor'}`);
      }
    } catch (err) {
      console.error('Delete all photos failed:', err);
      showToast('⚠️ Error al eliminar fotos');
    } finally {
      setIsDeletingAllPhotos(false);
    }
  };

  const handleSetCoverPhoto = async (photoUrl: string, idx: number) => {
    if (!item || settingCoverIndex !== null) return;
    setSettingCoverIndex(idx);
    try {
      const res = await authFetch(`/api/inventory/${item.id}/set-cover-image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: photoUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setCurrentItem(data.item);
          onItemUpdated?.(data.item);
        }
        showToast('⭐ Foto establecida como portada principal');
      } else {
        throw new Error('Error al actualizar foto principal');
      }
    } catch {
      showToast('⚠️ No se pudo establecer como foto principal');
    } finally {
      setSettingCoverIndex(null);
    }
  };

  const handleRemovePhoto = async (photoUrl: string, idx: number) => {
    if (!item || removingPhotoIndex !== null) return;
    setRemovingPhotoIndex(idx);
    try {
      const res = await authFetch(`/api/inventory/${item.id}/delete-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: photoUrl,
          photoIndex: idx,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setCurrentItem(data.item);
          onItemUpdated?.(data.item);
        }
        showToast('🗑️ Foto eliminada del producto');
      } else {
        throw new Error('Error al eliminar foto');
      }
    } catch {
      showToast('⚠️ No se pudo eliminar la foto');
    } finally {
      setRemovingPhotoIndex(null);
    }
  };

  const handleDownloadAllPhotos = async () => {
    if (downloadingAllPhotos || productPhotos.length === 0) return;
    setDownloadingAllPhotos(true);
    showToast(`📥 Descargando ${productPhotos.length} fotos...`);
    try {
      await downloadMultipleImages(
        productPhotos,
        item.sku || 'producto',
        (curr, total) => {
          showToast(`📥 Descargando foto ${curr} de ${total}...`);
        }
      );
      showToast(`✅ ${productPhotos.length} fotos descargadas`);
    } catch {
      showToast(`⚠️ Descarga completada`);
    } finally {
      setDownloadingAllPhotos(false);
    }
  };

  const handleDownloadSinglePhoto = async (photoUrl: string, idx: number) => {
    if (downloadingPhotoIndex !== null) return;
    setDownloadingPhotoIndex(idx);
    showToast(`📥 Descargando foto #${idx + 1}...`);
    try {
      const ok = await downloadImage(
        photoUrl,
        `${item.sku || 'producto'}-foto-${idx + 1}.jpg`
      );
      if (ok) {
        showToast(`✅ Foto #${idx + 1} descargada`);
      } else {
        showToast(`⚠️ Revisa la descarga de la foto #${idx + 1}`);
      }
    } catch {
      showToast(`⚠️ Error al descargar foto #${idx + 1}`);
    } finally {
      setDownloadingPhotoIndex(null);
    }
  };

  const [copyingPhotoIndex, setCopyingPhotoIndex] = useState<number | null>(null);
  const handleCopySinglePhoto = async (photoUrl: string, idx: number) => {
    if (copyingPhotoIndex !== null) return;
    setCopyingPhotoIndex(idx);
    showToast(`📋 Copiando foto #${idx + 1} al portapapeles...`);
    try {
      const res = await copyImageToClipboard(photoUrl);
      showToast(res.message);
    } catch {
      showToast(`⚠️ No se pudo copiar la foto #${idx + 1}`);
    } finally {
      setCopyingPhotoIndex(null);
    }
  };

  const handleShareWhatsApp = (text: string) => {
    const encoded = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const paymentListPreview = parsePaymentTitlesArray();
  const shippingListPreview = parseShippingCompaniesArray();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 md:p-6">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl relative max-h-[94vh] flex flex-col text-slate-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Toast Alert Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl flex items-center space-x-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 max-w-[90%] text-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-indigo-600 mr-1" />
                  Asistente de generación con IA
                </span>
                {lastSavedTime && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center space-x-1">
                    <Database className="w-3 h-3 text-emerald-600 mr-1" />
                    Guardado en BD
                  </span>
                )}
                {showSku && item.sku && (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                    {item.sku}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1 line-clamp-1">
                {item.name}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Toolbar: Tone & Settings Controls */}
        <div className="py-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 -mx-4 sm:-mx-6 px-4 sm:px-6">
          {/* Tone Selector */}
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
            <span className="text-xs font-bold text-slate-500 mr-1 hidden sm:inline">Estilo:</span>
            {[
              { id: 'persuasive', label: '🎯 Persuasivo' },
              { id: 'urgency', label: '🔥 Urgencia' },
              { id: 'direct', label: '⚡ Directo' },
              { id: 'exclusive', label: '💎 Premium' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => handleChangeTone(t.id as any)}
                disabled={loading}
                className={`text-xs px-2.5 py-1.5 rounded-xl font-medium transition flex items-center space-x-1 cursor-pointer shrink-0 ${
                  tone === t.id
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
                }`}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Settings Toggle Button */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 cursor-pointer ${
              showOptions
                ? 'bg-sky-50 border-sky-300 text-sky-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ajustar Métodos & Datos</span>
            {showOptions ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>
        </div>

        {/* Prominent Check List Bar: Stock, Phone, SKU */}
        <div className="py-2 px-3 sm:px-4 bg-slate-100/70 border-b border-slate-200 rounded-xl my-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-600 flex items-center text-[11px] uppercase tracking-wider">
            <CheckSquare className="w-3.5 h-3.5 text-sky-600 mr-1.5" />
            Incluir en la publicación:
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Checkbox: Mostrar Stock */}
            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-sky-300 transition shadow-2xs">
              <input
                type="checkbox"
                checked={showStock}
                onChange={(e) => handleToggleStock(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
              />
              <Boxes className="w-3.5 h-3.5 text-slate-500" />
              <span className={`text-xs font-medium ${showStock ? 'text-slate-900 font-bold' : 'text-slate-500 line-through opacity-70'}`}>
                Stock ({item.stock ?? 1} und)
              </span>
            </label>

            {/* Checkbox: Mostrar WhatsApp / Teléfono */}
            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-sky-300 transition shadow-2xs">
              <input
                type="checkbox"
                checked={showPhone}
                onChange={(e) => handleTogglePhone(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
              />
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span className={`text-xs font-medium ${showPhone ? 'text-slate-900 font-bold' : 'text-slate-500 line-through opacity-70'}`}>
                Teléfono / WhatsApp
              </span>
            </label>

            {/* Checkbox: Mostrar Código / SKU */}
            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-sky-300 transition shadow-2xs">
              <input
                type="checkbox"
                checked={showSku}
                onChange={(e) => handleToggleSku(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
              />
              <Hash className="w-3.5 h-3.5 text-slate-500" />
              <span className={`text-xs font-medium ${showSku ? 'text-slate-900 font-bold' : 'text-slate-500 line-through opacity-70'}`}>
                Código / SKU
              </span>
            </label>

            {/* Checkbox: Mostrar Web / Tienda Online */}
            <label className="inline-flex items-center space-x-1.5 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-sky-300 transition shadow-2xs">
              <input
                type="checkbox"
                checked={showWebsite}
                onChange={(e) => handleToggleWebsite(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600"
              />
              <Globe className="w-3.5 h-3.5 text-sky-600" />
              <span className={`text-xs font-medium ${showWebsite ? 'text-slate-900 font-bold' : 'text-slate-500 line-through opacity-70'}`}>
                Web / Tienda
              </span>
            </label>
          </div>
        </div>

        {/* Collapsible Settings Panel: Price, Contact, Payment Titles, Couriers, Store Link */}
        {showOptions && (
          <div className="py-3 px-4 bg-sky-50/60 border border-sky-100 rounded-2xl my-2 space-y-3 text-xs animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 flex items-center mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                  Precio de Venta:
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder={String(item.salePrice)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 flex items-center mb-1">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                  WhatsApp de Contacto:
                </label>
                <input
                  type="text"
                  value={whatsappContact}
                  onChange={(e) => setWhatsappContact(e.target.value)}
                  placeholder="Ej. +593983302390"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 flex items-center mb-1">
                  <Truck className="w-3.5 h-3.5 text-sky-600 mr-1" />
                  Cobertura de Envíos:
                </label>
                <input
                  type="text"
                  value={cityOrRegion}
                  onChange={(e) => setCityOrRegion(e.target.value)}
                  placeholder="Ej. Envíos a todo el país"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-sky-100">
              <div>
                <label className="font-bold text-slate-700 flex items-center justify-between mb-1">
                  <span className="flex items-center">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 mr-1" />
                    Dirección Física:
                  </span>
                </label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Ej. Av. Amazonas y República, Local #12, Quito"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Aparece al final de la publicación.
                </span>
              </div>
              <div>
                <label className="font-bold text-slate-700 flex items-center justify-between mb-1">
                  <span className="flex items-center">
                    <CreditCard className="w-3.5 h-3.5 text-indigo-600 mr-1" />
                    Métodos de Pago:
                  </span>
                </label>
                <input
                  type="text"
                  value={paymentTitlesInput}
                  onChange={(e) => setPaymentTitlesInput(e.target.value)}
                  placeholder="Transferencia, Pichincha, Guayaquil, Deuna, Efectivo"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Solo títulos de pago al pie.
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-sky-100">
              <label className="font-bold text-slate-700 flex items-center justify-between mb-1">
                <span className="flex items-center">
                  <Truck className="w-3.5 h-3.5 text-amber-600 mr-1" />
                  Empresas de Envío:
                </span>
              </label>
              <input
                type="text"
                value={shippingCompaniesInput}
                onChange={(e) => setShippingCompaniesInput(e.target.value)}
                placeholder="Servientrega, LaarCourier, Cooperativas de Transporte, Entregas a Domicilio"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-sky-500 text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Aparecen al pie de la publicación bajo la sección de envíos.
              </span>
            </div>

            {/* Enlace de la Tienda Info Box */}
            <div className="p-2.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center space-x-2 min-w-0">
                <Globe className="w-4 h-4 text-sky-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500">
                    Enlace automático de la tienda (del botón <strong>Compartir Tienda</strong>):
                  </p>
                  <p className="text-xs font-mono font-bold text-sky-700 truncate select-all">
                    {dynamicStoreUrl}
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md font-bold shrink-0">
                Automático
              </span>
            </div>
          </div>
        )}

        {/* Product Photos Section: Direct Download & Web Search */}
        <div className="py-2 px-3.5 bg-slate-50 border border-slate-200 rounded-2xl mb-1.5">
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <div className="flex items-center space-x-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-xs font-bold text-slate-800">
                Fotos del Producto ({productPhotos.length})
              </span>
            </div>
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              {/* Single Button to Search Web Images with AI */}
              <button
                type="button"
                onClick={() => setShowWebImagePicker(true)}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white text-[11px] font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                title="Buscar fotos idénticas de este producto en internet usando IA y agregarlas"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Buscar con IA</span>
              </button>

              {productPhotos.length > 1 && (
                <button
                  type="button"
                  disabled={downloadingAllPhotos || downloadingPhotoIndex !== null}
                  onClick={handleDownloadAllPhotos}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Descargar todas las fotos del producto"
                >
                  {downloadingAllPhotos ? (
                    <Loader2 className="w-3.5 h-3.5 text-sky-600 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-sky-600" />
                  )}
                  <span>{downloadingAllPhotos ? 'Descargando...' : 'Descargar Todas'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Photos Cards Carousel / Grid */}
          {productPhotos.length > 0 ? (
            <div className="flex items-center space-x-2 overflow-x-auto py-1 scrollbar-thin">
              {productPhotos.map((photoUrl, idx) => (
                <div
                  key={idx}
                  className="group relative bg-white rounded-xl border border-slate-200 p-1 shadow-xs hover:shadow-md transition flex-shrink-0"
                >
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden relative bg-slate-100">
                    <img
                      src={photoUrl}
                      alt={`${item.name} - Foto ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md backdrop-blur-xs flex items-center space-x-0.5">
                      {idx === 0 ? (
                        <>
                          <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                          <span>Portada</span>
                        </>
                      ) : (
                        <span>#{idx + 1}</span>
                      )}
                    </div>

                    {/* Quick remove button */}
                    <button
                      type="button"
                      disabled={removingPhotoIndex === idx}
                      onClick={() => handleRemovePhoto(photoUrl, idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/70 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-xs cursor-pointer"
                      title="Quitar foto del producto"
                    >
                      {removingPhotoIndex === idx ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  <div className="mt-1 flex items-center space-x-1">
                    {idx !== 0 && (
                      <button
                        type="button"
                        disabled={settingCoverIndex === idx}
                        onClick={() => handleSetCoverPhoto(photoUrl, idx)}
                        className="px-1.5 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold transition flex items-center justify-center space-x-0.5 cursor-pointer shadow-2xs"
                        title="Establecer como foto de portada principal"
                      >
                        {settingCoverIndex === idx ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <Star className="w-2.5 h-2.5 text-amber-600" />
                        )}
                        <span>Portada</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={downloadingPhotoIndex === idx || downloadingAllPhotos || copyingPhotoIndex === idx}
                      onClick={() => handleDownloadSinglePhoto(photoUrl, idx)}
                      className="flex-1 px-1.5 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[9px] font-bold transition flex items-center justify-center space-x-0.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      title="Descargar foto"
                    >
                      {downloadingPhotoIndex === idx ? (
                        <Loader2 className="w-2.5 h-2.5 text-sky-600 animate-spin" />
                      ) : (
                        <Download className="w-2.5 h-2.5 text-sky-600" />
                      )}
                      <span>{downloadingPhotoIndex === idx ? '...' : 'Descargar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={copyingPhotoIndex === idx || downloadingAllPhotos || downloadingPhotoIndex === idx}
                      onClick={() => handleCopySinglePhoto(photoUrl, idx)}
                      className="px-1.5 py-0.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-bold transition flex items-center justify-center space-x-0.5 cursor-pointer shadow-2xs disabled:opacity-50"
                      title="Copiar imagen al portapapeles para pegar en WhatsApp o Facebook"
                    >
                      {copyingPhotoIndex === idx ? (
                        <Loader2 className="w-2.5 h-2.5 text-slate-600 animate-spin" />
                      ) : (
                        <Copy className="w-2.5 h-2.5 text-slate-600" />
                      )}
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-3 px-3 bg-white rounded-xl border border-dashed border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Este producto aún no tiene fotos registradas.</span>
              <button
                type="button"
                onClick={() => setShowWebImagePicker(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Buscar fotos idénticas con IA ahora</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-2 space-y-3.5 pr-1">
          {loading ? (
            /* Loading State */
            <div className="py-14 flex flex-col items-center justify-center text-center space-y-3.5">
              <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-sm animate-spin">
                <RefreshCw className="w-7 h-7" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900">
                  Redactando publicación universal y paneles con IA...
                </p>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Generando título optimizado, precio, SKU, etiquetas de búsqueda y texto universal. Se guardará automáticamente en la base de datos.
                </p>
              </div>
            </div>
          ) : !copyData ? (
            /* Initial State: Waiting for user to click Generate */
            <div className="py-6 px-4 flex flex-col items-center text-center space-y-3.5 bg-gradient-to-b from-slate-50/70 to-slate-100/40 rounded-2xl border border-dashed border-slate-200">
              {/* Product Info Card Preview */}
              <div className="max-w-md w-full bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-3.5 text-left">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    <Package className="w-8 h-8" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                    {item.category || 'General'}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 truncate">{item.name}</h4>
                  <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                    <span className="text-xs font-bold text-emerald-600">
                      ${customPrice || item.salePrice} {currency}
                    </span>
                    {showStock && (
                      <>
                        <span className="text-[11px] text-slate-400">•</span>
                        <span className="text-[11px] text-slate-500">Stock: {item.stock ?? 1} und.</span>
                      </>
                    )}
                    {showSku && item.sku && (
                      <>
                        <span className="text-[11px] text-slate-400">•</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          SKU: {item.sku}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Ready to generate prompt */}
              <div className="max-w-md space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  Generación de Publicación Universal + Paneles Individuales
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Genera la publicación completa y paneles separados de Título, Precio, SKU y Etiquetas para copiar en 1 clic en Facebook Marketplace, Mercado Libre, Shopify o WhatsApp, guardando todo en la BD.
                </p>
              </div>

              {/* Included at the bottom preview badges */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-lg text-[11px]">
                <span className="text-slate-400 text-[10px] font-bold mr-1">Al final incluirá:</span>
                {paymentListPreview.slice(0, 4).map((p, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200 font-medium">
                    💳 {p}
                  </span>
                ))}
                {shippingListPreview.slice(0, 3).map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md border border-amber-200 font-medium">
                    🚚 {s}
                  </span>
                ))}
              </div>

              {/* Prominent Generate Button */}
              <button
                onClick={() => handleGenerate()}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-sky-600/25 hover:shadow-xl transition flex items-center space-x-2.5 cursor-pointer transform hover:-translate-y-0.5"
              >
                <Sparkles className="w-5 h-5 animate-pulse" />
                <span>✨ Generar Publicación y Paneles con IA</span>
              </button>
            </div>
          ) : (
            /* Generated State: Individual Panels + Universal Description */
            <div className="space-y-4">
              
              {/* Top Section Header: View Mode & Database Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5 sm:px-4">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-800">
                    Información Generada para Publicación
                  </span>
                  {lastSavedTime && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-medium flex items-center">
                      <Database className="w-3 h-3 mr-1 text-emerald-600" />
                      Guardado en BD ({new Date(lastSavedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 font-medium hidden sm:block">
                  Edita los campos o copia con 1 clic en la parte inferior
                </div>
              </div>

              {/* INDIVIDUAL PANELS: TÍTULO, PRECIO, SKU, ETIQUETAS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 mr-1.5" />
                    Paneles Individuales para Marketplace / Tiendas
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Haz clic en "Copiar" para pegar en cada campo de tu plataforma
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  
                  {/* Panel 1: Título */}
                  <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs hover:border-sky-300 transition space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                        <Type className="w-3.5 h-3.5 text-sky-600" />
                        <span>Título de Publicación</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(titleField, 'title', 'Título')}
                        className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs"
                      >
                        {copiedKey === 'title' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-sky-600" />
                            <span>Copiar Título</span>
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={titleField}
                      onChange={(e) => setTitleField(e.target.value)}
                      placeholder="Título optimizado para venta..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:bg-white focus:outline-sky-500 focus:ring-1 focus:ring-sky-500 transition"
                    />
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Optimizado con palabras clave para búsquedas</span>
                      <span>{titleField.length} caracteres</span>
                    </div>
                  </div>

                  {/* Panel 2 & 3: Precio y SKU en columna */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-1 gap-2.5">
                    {/* Panel Precio */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs hover:border-emerald-300 transition space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          <span>Precio</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(priceField.replace('$', ''), 'price', 'Precio')}
                          className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedKey === 'price' ? (
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-emerald-600" />
                          )}
                          <span>Copiar</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={priceField}
                        onChange={(e) => setPriceField(e.target.value)}
                        placeholder="$0.00"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-xs font-bold focus:bg-white focus:outline-emerald-500 transition"
                      />
                    </div>

                    {/* Panel SKU / Código */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs hover:border-slate-400 transition space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                          <Hash className="w-3 h-3 text-slate-600" />
                          <span>Código / SKU</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(skuField, 'sku', 'Código SKU')}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedKey === 'sku' ? (
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-600" />
                          )}
                          <span>Copiar</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={skuField}
                        onChange={(e) => setSkuField(e.target.value)}
                        placeholder="Código..."
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-xs font-mono font-bold focus:bg-white focus:outline-slate-500 transition"
                      />
                    </div>
                  </div>

                  {/* Panel 4: Etiquetas / Tags (Full Width in Grid) */}
                  <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs hover:border-indigo-300 transition space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <TagIcon className="w-3.5 h-3.5 text-indigo-600" />
                        <label className="text-xs font-bold text-slate-800">
                          Etiquetas / Tags ({tagsList.length})
                        </label>
                        <span className="text-[10px] text-slate-400 hidden sm:inline">
                          (Haz clic en un tag para copiarlo individualmente)
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(tagsList.join(', '), 'tags-comma', 'Tags separados por comas')}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs"
                        >
                          {copiedKey === 'tags-comma' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">¡Copiados!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-indigo-600" />
                              <span>Copiar Tags (Comas)</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(tagsList.map((t) => `#${t}`).join(' '), 'tags-hash', 'Hashtags')}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedKey === 'tags-hash' ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-700">¡Copiados!</span>
                            </>
                          ) : (
                            <>
                              <Hash className="w-3 h-3 text-slate-600" />
                              <span>Copiar #Hashtags</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Tags List Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200/80 min-h-[42px]">
                      {tagsList.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium shadow-2xs hover:border-indigo-400 group cursor-pointer transition"
                          onClick={() => copyToClipboard(tag, `tag-${idx}`, `Tag "${tag}"`)}
                          title="Clic para copiar este tag"
                        >
                          <span className="text-indigo-600 font-bold mr-0.5">#</span>
                          <span>{tag}</span>
                          {copiedKey === `tag-${idx}` ? (
                            <Check className="w-3 h-3 text-emerald-600 ml-1 shrink-0" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-slate-400 ml-1 opacity-0 group-hover:opacity-100 transition shrink-0" />
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(tag);
                            }}
                            className="ml-1 text-slate-300 hover:text-rose-500 rounded-full p-0.5 transition"
                            title="Eliminar tag"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}

                      {/* Add new tag inline input */}
                      <div className="flex items-center space-x-1 pl-1">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          placeholder="+ Agregar tag..."
                          className="px-2 py-0.5 bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:rounded-md focus:ring-1 focus:ring-sky-400 w-28"
                        />
                        {newTagInput.trim() && (
                          <button
                            type="button"
                            onClick={handleAddTag}
                            className="px-1.5 py-0.5 bg-sky-600 text-white rounded text-[10px] font-bold hover:bg-sky-500"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* PANEL PUBLICACIÓN UNIVERSAL (FULL TEXT) */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Publicación Universal Completa (WhatsApp, Redes, Facebook)
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                    <span>{universalText.length} caracteres</span>
                    <span>•</span>
                    <span>{universalText.split(/\s+/).filter(Boolean).length} palabras</span>
                  </div>
                </div>

                {/* Editable Universal Text Area */}
                <div className="relative">
                  <textarea
                    rows={12}
                    value={universalText}
                    onChange={(e) => setUniversalText(e.target.value)}
                    className="w-full p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed border border-slate-700 focus:outline-sky-500 focus:ring-2 focus:ring-sky-500/30 resize-y shadow-inner whitespace-pre-wrap"
                    placeholder="Texto de la publicación..."
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 bg-slate-800/90 px-2.5 py-1 rounded-md border border-slate-700 pointer-events-none">
                    ✏️ Puedes editar el texto directamente aquí y guardar en la BD
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            {copyData ? (
              <>
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={loading || isDeletingCopy}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="Regenerar texto con IA"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Regenerar</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveToDb()}
                  disabled={savingDb || isDeletingCopy}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  title="Guardar todos los paneles y texto actual en la base de datos"
                >
                  <Save className={`w-3.5 h-3.5 ${savingDb ? 'animate-spin text-emerald-600' : 'text-emerald-600'}`} />
                  <span>{savingDb ? 'Guardando...' : 'Guardar en BD'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeletingCopy}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Eliminar publicación generada con IA para este producto"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Eliminar Publicación IA</span>
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">
                Selecciona tus opciones en el checklist y genera tu publicación.
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
            >
              Cerrar
            </button>

            {copyData && (
              <button
                type="button"
                onClick={() => handleShareWhatsApp(universalText)}
                className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Enviar por WhatsApp</span>
              </button>
            )}

            {copyData ? (
              <button
                type="button"
                onClick={() => copyToClipboard(universalText, 'universal-all', 'Publicación Universal')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center space-x-2 cursor-pointer"
              >
                {copiedKey === 'universal-all' ? (
                  <>
                    <Check className="w-4 h-4 text-white animate-in zoom-in" />
                    <span>¡Texto Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>📋 Copiar Publicación Completa</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition flex items-center space-x-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generar Publicación con IA</span>
              </button>
            )}
          </div>
        </div>

        {/* Delete Marketing Copy Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 rounded-3xl animate-in fade-in">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-3.5 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-900">¿Eliminar Publicación IA?</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Se eliminará la publicación universal y los textos de marketing guardados en la base de datos para este producto. Podrás generar una nueva en cualquier momento.
              </p>
              <div className="flex items-center justify-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingCopy}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteMarketingCopy}
                  disabled={isDeletingCopy}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${isDeletingCopy ? 'animate-spin' : ''}`} />
                  <span>{isDeletingCopy ? 'Eliminando...' : 'Sí, Eliminar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Web Image Search & Selection Modal */}
        {showWebImagePicker && (
          <ProductWebImagePicker
            item={currentItem || item}
            isOpen={showWebImagePicker}
            onClose={() => setShowWebImagePicker(false)}
            onImagesAdded={(updatedItem, count) => {
              setCurrentItem(updatedItem);
              onItemUpdated?.(updatedItem);
              showToast(`✨ ¡${count} foto${count === 1 ? '' : 's'} agregada${count === 1 ? '' : 's'} al producto!`);
            }}
          />
        )}
      </div>
    </div>
  );
};
