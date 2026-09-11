import React, { useState, useEffect, useRef } from 'react';
import { CostOption, InventoryItem } from '../types.ts';
import {
  AlertTriangle,
  BadgePercent,
  Barcode,
  Boxes,
  Camera,
  Check,
  Copy,
  DollarSign,
  ExternalLink,
  Film,
  Flame,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  Package,
  PackageCheck,
  Percent,
  Play,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Scale,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  UploadCloud,
  Video,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { ImageLightboxModal } from './ImageLightboxModal.tsx';
import { ProductAiVideoPickerModal } from './ProductAiVideoPickerModal.tsx';
import { ProductMarketingCopyModal } from './ProductMarketingCopyModal.tsx';
import { ProductWebImagePicker } from './ProductWebImagePicker.tsx';
import { parseVideoUrl } from '../utils/video-helper.ts';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingItem: InventoryItem | null;
  defaultTelegramTaxPercent?: number;
}

const CATEGORIES = [
  'Calzado',
  'Ropa y Moda',
  'Electrónica y Celulares',
  'Computación y Accesorios',
  'Hogar y Cocina',
  'Belleza y Cuidado Personal',
  'Deportes y Fitness',
  'Juguetes y Niños',
  'Ferretería y Herramientas',
  'General',
];

const MARGIN_PRESETS = [20, 30, 40, 50, 75, 100];
const DISCOUNT_PRESETS = [0, 5, 10, 15, 20, 25, 30, 40, 50];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingItem,
  defaultTelegramTaxPercent,
}) => {
  const { authFetch } = useAuth();
  const [telegramTaxPercent, setTelegramTaxPercent] = useState<number>(defaultTelegramTaxPercent ?? 15);
  const [hasPurchaseTax, setHasPurchaseTax] = useState<boolean>(true);
  const [purchaseTaxPercent, setPurchaseTaxPercent] = useState<number>(defaultTelegramTaxPercent ?? 15);
  const [applySaleTax, setApplySaleTax] = useState<boolean>(false);
  const [saleTaxPercent, setSaleTaxPercent] = useState<number>(defaultTelegramTaxPercent ?? 15);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('General');
  const [costPrice, setCostPrice] = useState('0.00');
  const [costWithoutTax, setCostWithoutTax] = useState('0.00');
  const [costWithTax, setCostWithTax] = useState('0.00');
  const [taxRate, setTaxRate] = useState<number>(15);
  const [salePrice, setSalePrice] = useState('0.00');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [marginPercent, setMarginPercent] = useState<number>(30);
  const [costOptions, setCostOptions] = useState<CostOption[]>([]);
  const [stock, setStock] = useState(1);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [isPlayingVideoPreview, setIsPlayingVideoPreview] = useState(false);
  const [isVideoPickerOpen, setIsVideoPickerOpen] = useState(false);
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [supplierName, setSupplierName] = useState('Proveedor Telegram');
  const [description, setDescription] = useState('');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [descSuccessMsg, setDescSuccessMsg] = useState<string | null>(null);
  const [tags, setTags] = useState('');
  const [rawTelegramMessage, setRawTelegramMessage] = useState('');
  const [copiedTelegram, setCopiedTelegram] = useState(false);
  const [status, setStatus] = useState<'available' | 'low_stock' | 'sold_out' | 'archived'>('available');
  const [showMarketingModal, setShowMarketingModal] = useState<boolean>(false);
  const [showWebImagePicker, setShowWebImagePicker] = useState<boolean>(false);
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real-time Ecuador Market Quotation states (Google Search Grounding + Gemini)
  const [isQuotingMarket, setIsQuotingMarket] = useState(false);
  const [marketQuote, setMarketQuote] = useState<{
    minMarketPrice: number;
    maxMarketPrice: number;
    avgMarketPrice: number;
    suggestedSalePrice: number;
    estimatedProfit: number;
    profitMarginPercent: number;
    competitiveness: 'alta' | 'media' | 'exclusiva';
    marketSummary: string;
    sources: { title: string; url?: string }[];
    keyTips: string[];
    isEstimatedFallback?: boolean;
  } | null>(null);
  const [marketQuoteError, setMarketQuoteError] = useState<string | null>(null);
  const [showQuoteDrawer, setShowQuoteDrawer] = useState(false);
  const [appliedPriceFeedback, setAppliedPriceFeedback] = useState(false);

  // Direct image upload states & ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [directUrl, setDirectUrl] = useState('');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Helper to read and compress image file to high-quality Base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
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

  // Support selecting and uploading multiple files from local disk/device
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const validFiles = fileList.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setError('Por favor selecciona archivos de imagen válidos (JPG, PNG, WEBP, GIF).');
      return;
    }
    setIsProcessingPhoto(true);
    setError(null);
    try {
      const b64List = await Promise.all(validFiles.map((f) => readFileAsBase64(f)));

      // Add all new photos to extraImages
      setExtraImages((prev) => {
        const merged = [...prev];
        b64List.forEach((b) => {
          if (!merged.includes(b)) merged.push(b);
        });
        return merged;
      });

      // If no cover is currently selected, set the first uploaded image as cover
      setImageUrl((currentCover) => {
        if (!currentCover && b64List.length > 0) {
          return b64List[0];
        }
        return currentCover;
      });
    } catch (err) {
      console.error('Error processing photos:', err);
      setError('Error al procesar las fotos seleccionadas.');
    } finally {
      setIsProcessingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetAsCover = (photoUrl: string) => {
    setImageUrl(photoUrl);
    setExtraImages((prev) => {
      const without = prev.filter((p) => p !== photoUrl);
      return [photoUrl, ...without];
    });
  };

  const handleRemovePhoto = (photoToRemove: string) => {
    setExtraImages((prev) => {
      const remaining = prev.filter((p) => p !== photoToRemove);
      return remaining;
    });
    setImageUrl((currentCover) => {
      if (currentCover === photoToRemove) {
        const remaining = extraImages.filter((p) => p !== photoToRemove);
        return remaining[0] || '';
      }
      return currentCover;
    });
  };

  const handleAddDirectUrl = () => {
    const clean = directUrl.trim();
    if (!clean) return;
    setImageUrl((currentCover) => (!currentCover ? clean : currentCover));
    setExtraImages((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setDirectUrl('');
    setShowUrlInput(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Synchronize default Telegram tax rate from props or API
  useEffect(() => {
    if (defaultTelegramTaxPercent !== undefined) {
      setTelegramTaxPercent(defaultTelegramTaxPercent);
    } else {
      authFetch('/api/telegram/config')
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (cfg && typeof cfg.taxPercent === 'number') {
            setTelegramTaxPercent(cfg.taxPercent);
          }
        })
        .catch(() => {});
    }
  }, [defaultTelegramTaxPercent, isOpen]);

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name || '');
      setSku(editingItem.sku || '');
      setBarcode(editingItem.barcode || '');
      setCategory(editingItem.category || 'General');
      
      const costNum = parseFloat(editingItem.costPrice) || 0;
      const saleNum = parseFloat(editingItem.salePrice) || 0;

      let parsedAttr: Record<string, any> = {};
      if (editingItem.extractedAttributes) {
        try {
          parsedAttr =
            typeof editingItem.extractedAttributes === 'string'
              ? JSON.parse(editingItem.extractedAttributes)
              : editingItem.extractedAttributes;
        } catch {}
      }

      // Check if product has purchase tax (IVA en compra)
      const rawTaxRate =
        editingItem.taxRate !== undefined && editingItem.taxRate !== null && !isNaN(Number(editingItem.taxRate))
          ? Number(editingItem.taxRate)
          : parsedAttr.taxRate !== undefined && !isNaN(Number(parsedAttr.taxRate))
          ? Number(parsedAttr.taxRate)
          : parsedAttr.taxPercent !== undefined && !isNaN(Number(parsedAttr.taxPercent))
          ? Number(parsedAttr.taxPercent)
          : undefined;

      const itemHasPurchaseTax =
        editingItem.hasPurchaseTax !== undefined
          ? Boolean(editingItem.hasPurchaseTax)
          : parsedAttr.hasPurchaseTax !== undefined
          ? Boolean(parsedAttr.hasPurchaseTax)
          : parsedAttr.taxStatus === 'NOT_SPECIFIED'
          ? false
          : rawTaxRate !== undefined
          ? rawTaxRate > 0
          : true;

      const effectivePurchaseTaxPercent =
        rawTaxRate !== undefined && rawTaxRate > 0
          ? rawTaxRate
          : parsedAttr.purchaseTaxPercent !== undefined && !isNaN(Number(parsedAttr.purchaseTaxPercent)) && Number(parsedAttr.purchaseTaxPercent) > 0
          ? Number(parsedAttr.purchaseTaxPercent)
          : (defaultTelegramTaxPercent ?? telegramTaxPercent ?? 15);

      setHasPurchaseTax(itemHasPurchaseTax);
      setPurchaseTaxPercent(effectivePurchaseTaxPercent);
      const activeTaxRate = itemHasPurchaseTax ? effectivePurchaseTaxPercent : 0;
      setTaxRate(activeTaxRate);

      let initialCostWithout =
        editingItem.costWithoutTax !== undefined && editingItem.costWithoutTax !== null
          ? String(editingItem.costWithoutTax)
          : '';
      let initialCostWith =
        editingItem.costWithTax !== undefined && editingItem.costWithTax !== null
          ? String(editingItem.costWithTax)
          : editingItem.costPrice || '0.00';

      if (!itemHasPurchaseTax) {
        const effCost = initialCostWith || initialCostWithout || editingItem.costPrice || '0.00';
        initialCostWithout = effCost;
        initialCostWith = effCost;
      } else {
        if (!initialCostWithout && initialCostWith) {
          initialCostWithout = (parseFloat(initialCostWith) / (1 + effectivePurchaseTaxPercent / 100)).toFixed(2);
        }
        if (!initialCostWith && initialCostWithout) {
          initialCostWith = (parseFloat(initialCostWithout) * (1 + effectivePurchaseTaxPercent / 100)).toFixed(2);
        }
      }

      setCostWithoutTax(initialCostWithout || '0.00');
      setCostWithTax(initialCostWith || editingItem.costPrice || '0.00');
      setCostPrice(initialCostWith || editingItem.costPrice || '0.00');
      setSalePrice(editingItem.salePrice || '0.00');

      // Check if product has applySaleTax configured
      const itemApplySaleTax =
        editingItem.applySaleTax !== undefined
          ? Boolean(editingItem.applySaleTax)
          : parsedAttr.applySaleTax !== undefined
          ? Boolean(parsedAttr.applySaleTax)
          : false;
      setApplySaleTax(itemApplySaleTax);

      // Percentage defaults to Telegram IVA defined in config (or item's saved sale tax)
      const itemSaleTaxPercent =
        editingItem.saleTaxPercent !== undefined && !isNaN(Number(editingItem.saleTaxPercent))
          ? Number(editingItem.saleTaxPercent)
          : parsedAttr.saleTaxPercent !== undefined && !isNaN(Number(parsedAttr.saleTaxPercent))
          ? Number(parsedAttr.saleTaxPercent)
          : (defaultTelegramTaxPercent ?? telegramTaxPercent ?? effectivePurchaseTaxPercent);
      setSaleTaxPercent(itemSaleTaxPercent);

      // Extract cost options
      if (Array.isArray(parsedAttr.costOptions) && parsedAttr.costOptions.length > 0) {
        setCostOptions(parsedAttr.costOptions);
      } else if (costNum > 0) {
        setCostOptions([{ label: `Costo Principal ($${costNum.toFixed(2)})`, price: costNum }]);
      } else {
        setCostOptions([]);
      }

      // Calculate initial margin based on net cost without IVA
      const costWithoutNum = parseFloat(initialCostWithout) || 0;
      if (parsedAttr.profitMarginPercent !== undefined) {
        setMarginPercent(Number(parsedAttr.profitMarginPercent));
      } else if (costWithoutNum > 0 && saleNum > 0) {
        const baseSale = itemApplySaleTax && itemSaleTaxPercent > 0 ? saleNum / (1 + itemSaleTaxPercent / 100) : saleNum;
        const util = baseSale - costWithoutNum;
        setMarginPercent(Math.round((util / costWithoutNum) * 100));
      } else {
        setMarginPercent(30);
      }

      setDiscountPercent(editingItem.discountPercent || 0);
      setStock(editingItem.stock ?? 0);

      // Collect all available photos for the item
      const initialPhotos: string[] = [];
      if (editingItem.imageUrl) initialPhotos.push(editingItem.imageUrl);
      if (Array.isArray(editingItem.images)) {
        editingItem.images.forEach((img) => {
          if (img && !initialPhotos.includes(img)) initialPhotos.push(img);
        });
      }
      if (Array.isArray(parsedAttr.images)) {
        parsedAttr.images.forEach((img: string) => {
          if (img && !initialPhotos.includes(img)) initialPhotos.push(img);
        });
      }
      const initialCover = editingItem.imageUrl || initialPhotos[0] || '';
      setImageUrl(initialCover);
      setExtraImages(initialPhotos);

      setVideoUrl(editingItem.videoUrl || '');
      setIsPlayingVideoPreview(false);
      setSupplierName(editingItem.supplierName || 'Proveedor Telegram');
      setDescription(editingItem.description || '');
      setTags(editingItem.tags || '');
      setRawTelegramMessage(editingItem.rawTelegramMessage || '');
      setStatus(editingItem.status || 'available');
    } else {
      setName('');
      setSku('');
      setBarcode('');
      setCategory('General');
      const defaultTax = defaultTelegramTaxPercent ?? telegramTaxPercent ?? 15;
      setHasPurchaseTax(true);
      setPurchaseTaxPercent(defaultTax);
      setTaxRate(defaultTax);
      setApplySaleTax(false);
      setSaleTaxPercent(defaultTax);
      setCostWithoutTax('100.00');
      setCostWithTax('115.00');
      setCostPrice('115.00');
      setMarginPercent(30);
      setSalePrice('130.00');
      setDiscountPercent(0);
      setCostOptions([
        {
          label: 'Costo Mayorista ($115.00)',
          price: 115.0,
          costWithoutTax: 100.0,
          costWithTax: 115.0,
          taxRate: defaultTax,
        },
      ]);
      setStock(0);
      setImageUrl('');
      setExtraImages([]);
      setVideoUrl('');
      setSupplierName('Proveedor Telegram');
      setDescription('');
      setTags('');
      setRawTelegramMessage('');
      setStatus('available');
    }
    setError(null);
    setMarketQuote(null);
    setMarketQuoteError(null);
    setShowQuoteDrawer(false);
    setAppliedPriceFeedback(false);
  }, [editingItem, isOpen, defaultTelegramTaxPercent]);

  const handleCopyTelegramMessage = () => {
    if (!rawTelegramMessage) return;
    navigator.clipboard.writeText(rawTelegramMessage);
    setCopiedTelegram(true);
    setTimeout(() => setCopiedTelegram(false), 2000);
  };

  // Helper to compute published list PVP so that after discount, net base equals costWithout + targetProfit
  const computePublishedPvp = (
    costWithout: number,
    margin: number,
    discount: number,
    hasSaleTax: boolean,
    saleTaxPct: number
  ): number => {
    const targetProfit = costWithout * (margin / 100);
    const netRequiredAfterDiscount = costWithout + targetProfit;
    const discRate = Math.max(0, Math.min(99, discount)) / 100;
    const publishedSinIVA = discRate > 0 && discRate < 1 ? netRequiredAfterDiscount / (1 - discRate) : netRequiredAfterDiscount;
    const activeSaleTax = hasSaleTax ? saleTaxPct : 0;
    return activeSaleTax > 0 ? publishedSinIVA * (1 + activeSaleTax / 100) : publishedSinIVA;
  };

  // Toggle hasPurchaseTax check and recalculate purchase costs
  const handleToggleHasPurchaseTax = (checked: boolean) => {
    setHasPurchaseTax(checked);
    const activeRate = checked ? (purchaseTaxPercent > 0 ? purchaseTaxPercent : (defaultTelegramTaxPercent ?? telegramTaxPercent ?? 15)) : 0;
    setTaxRate(activeRate);

    const costWithout = parseFloat(costWithoutTax) || 0;
    if (costWithout > 0) {
      const newCostWith = checked ? costWithout * (1 + activeRate / 100) : costWithout;
      setCostWithTax(newCostWith.toFixed(2));
      setCostPrice(newCostWith.toFixed(2));

      const newPvp = computePublishedPvp(costWithout, marginPercent, discountPercent, applySaleTax, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Change purchase tax percentage and recalculate costs if check is active
  const handlePurchaseTaxPercentChange = (newPercent: number) => {
    const clamped = Math.max(0, newPercent);
    setPurchaseTaxPercent(clamped);
    if (hasPurchaseTax) {
      setTaxRate(clamped);
      const costWithout = parseFloat(costWithoutTax) || 0;
      if (costWithout > 0) {
        const newCostWith = costWithout * (1 + clamped / 100);
        setCostWithTax(newCostWith.toFixed(2));
        setCostPrice(newCostWith.toFixed(2));
      }
    }
  };

  // Toggle applySaleTax check and recalculate sale price
  const handleToggleApplySaleTax = (checked: boolean) => {
    setApplySaleTax(checked);
    const costWithout = parseFloat(costWithoutTax) || 0;
    if (costWithout > 0) {
      const newPvp = computePublishedPvp(costWithout, marginPercent, discountPercent, checked, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Change sale tax percentage and recalculate sale price if check is active
  const handleSaleTaxPercentChange = (newPercent: number) => {
    setSaleTaxPercent(newPercent);
    if (applySaleTax) {
      const costWithout = parseFloat(costWithoutTax) || 0;
      if (costWithout > 0) {
        const newPvp = computePublishedPvp(costWithout, marginPercent, discountPercent, true, newPercent);
        setSalePrice(newPvp.toFixed(2));
      }
    }
  };

  // Recalculate sale price when margin changes
  const handleMarginChange = (newMargin: number) => {
    setMarginPercent(newMargin);
    const costWithout = parseFloat(costWithoutTax) || 0;
    if (costWithout > 0) {
      const newPvp = computePublishedPvp(costWithout, newMargin, discountPercent, applySaleTax, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Recalculate sale price when discount changes
  const handleDiscountChange = (newDiscount: number) => {
    setDiscountPercent(newDiscount);
    const costWithout = parseFloat(costWithoutTax) || 0;
    if (costWithout > 0) {
      const newPvp = computePublishedPvp(costWithout, marginPercent, newDiscount, applySaleTax, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Recalculate margin when user manually types a custom sale price (PVP)
  const handleSalePriceChange = (newVal: string) => {
    setSalePrice(newVal);
    const num = parseFloat(newVal);
    const costWithout = parseFloat(costWithoutTax) || 0;
    if (!isNaN(num) && costWithout > 0) {
      const publishedSinIVA = applySaleTax && saleTaxPercent > 0 ? num / (1 + saleTaxPercent / 100) : num;
      const discRate = Math.max(0, Math.min(99, discountPercent)) / 100;
      const netBaseAfterDiscount = publishedSinIVA * (1 - discRate);
      const util = netBaseAfterDiscount - costWithout;
      const calculatedMargin = Math.round((util / costWithout) * 100);
      if (calculatedMargin >= -100 && calculatedMargin <= 1000) {
        setMarginPercent(calculatedMargin);
      }
    }
  };

  // Recalculate when Cost Without Tax changes
  const handleCostWithoutTaxChange = (newVal: string) => {
    setCostWithoutTax(newVal);
    const numWithout = parseFloat(newVal);
    if (!isNaN(numWithout) && numWithout >= 0) {
      const activeTax = hasPurchaseTax ? purchaseTaxPercent : 0;
      const withTax = (numWithout * (1 + activeTax / 100)).toFixed(2);
      setCostWithTax(withTax);
      setCostPrice(withTax);
      const newPvp = computePublishedPvp(numWithout, marginPercent, discountPercent, applySaleTax, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Recalculate when Cost With Tax changes
  const handleCostWithTaxChange = (newVal: string) => {
    setCostWithTax(newVal);
    setCostPrice(newVal);
    const numWith = parseFloat(newVal);
    if (!isNaN(numWith) && numWith >= 0) {
      const activeTax = hasPurchaseTax ? purchaseTaxPercent : 0;
      const numWithout = activeTax > 0 ? numWith / (1 + activeTax / 100) : numWith;
      setCostWithoutTax(numWithout.toFixed(2));
      const newPvp = computePublishedPvp(numWithout, marginPercent, discountPercent, applySaleTax, saleTaxPercent);
      setSalePrice(newPvp.toFixed(2));
    }
  };

  // Handle selecting a specific cost option
  const handleSelectCostOption = (opt: CostOption) => {
    const optPrice = opt.price;
    const activeTax = hasPurchaseTax ? purchaseTaxPercent : 0;
    let optWithout: number;
    let optWith: number;

    if (typeof opt.costWithoutTax === 'number') {
      optWithout = opt.costWithoutTax;
      optWith = typeof opt.costWithTax === 'number' ? opt.costWithTax : optWithout * (1 + activeTax / 100);
    } else if (typeof opt.costWithTax === 'number') {
      optWith = opt.costWithTax;
      optWithout = activeTax > 0 ? optWith / (1 + activeTax / 100) : optWith;
    } else {
      optWith = optPrice;
      optWithout = activeTax > 0 ? optPrice / (1 + activeTax / 100) : optPrice;
    }

    setCostWithoutTax(optWithout.toFixed(2));
    setCostWithTax(optWith.toFixed(2));
    setCostPrice(optWith.toFixed(2));

    const newPvp = computePublishedPvp(optWithout, marginPercent, discountPercent, applySaleTax, saleTaxPercent);
    setSalePrice(newPvp.toFixed(2));
  };

  // Cotizar en tiempo real en Ecuador con Google Search Grounding y Gemini
  const handleQuoteMarketEcuador = async () => {
    if (!name.trim()) {
      setMarketQuoteError('Ingresa primero el nombre del producto para poder cotizarlo en el mercado de Ecuador.');
      setShowQuoteDrawer(true);
      return;
    }

    setIsQuotingMarket(true);
    setMarketQuoteError(null);
    setShowQuoteDrawer(true);

    try {
      const activeCost = parseFloat(costWithTax || costPrice) || 0;
      const res = await authFetch('/api/ai/market-quote-ecuador', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productName: name.trim(),
          category,
          description,
          costPrice: activeCost,
          marginPercent: marginPercent || 35,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo obtener la cotización de mercado en Ecuador.');
      }
      setMarketQuote(data);
    } catch (err: any) {
      console.error('Error quoting in Ecuador market:', err);
      setMarketQuoteError(err.message || 'Error al conectar con el cotizador de mercado');
    } finally {
      setIsQuotingMarket(false);
    }
  };

  // Aplicar precio sugerido por IA directamente al campo de PVP
  const handleApplySuggestedPrice = (suggested: number) => {
    if (!suggested || isNaN(suggested) || suggested <= 0) return;
    const priceStr = suggested.toFixed(2);
    handleSalePriceChange(priceStr);
    setAppliedPriceFeedback(true);
    setTimeout(() => setAppliedPriceFeedback(false), 2500);
  };

  // Generate or regenerate commercial description with Gemini AI mirroring Telegram processing
  const handleGenerateAiDescription = async () => {
    if (!name.trim()) {
      setError('Por favor ingresa primero el nombre del producto para generar la descripción.');
      return;
    }
    setError(null);
    setIsGeneratingDescription(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        description,
        tags,
        rawTelegramMessage: editingItem?.rawTelegramMessage,
        attributes: editingItem?.extractedAttributes,
        imageUrl: imageUrl || editingItem?.imageUrl,
        images: extraImages.length > 0 ? extraImages : editingItem?.images,
        costPrice,
        salePrice,
      };

      const res = await authFetch('/api/ai/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar la descripción');
      }

      if (data.description) {
        setDescription(data.description);
        setDescSuccessMsg('¡Descripción comercial generada con IA exitosamente!');
        setTimeout(() => setDescSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      console.error('Error generating description:', err);
      setError(err.message || 'Error al generar la descripción comercial con IA');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let existingAttr: Record<string, any> = {};
      if (editingItem?.extractedAttributes) {
        try {
          existingAttr =
            typeof editingItem.extractedAttributes === 'string'
              ? JSON.parse(editingItem.extractedAttributes)
              : editingItem.extractedAttributes;
        } catch {}
      }

      // Collect all photos and ensure cover is first if set
      const allPhotos = Array.from(new Set([imageUrl, ...extraImages].filter(Boolean)));
      const effectiveCover = imageUrl || allPhotos[0] || null;

      const mergedAttributes = {
        ...existingAttr,
        costOptions,
        profitMarginPercent: marginPercent,
        selectedCostPrice: parseFloat(costPrice) || 0,
        hasPurchaseTax,
        purchaseTaxPercent: hasPurchaseTax ? purchaseTaxPercent : 0,
        applySaleTax,
        saleTaxPercent,
        images: allPhotos,
        totalPhotos: allPhotos.length,
      };

      const url = editingItem ? `/api/inventory/${editingItem.id}` : '/api/inventory';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim(),
          barcode: barcode.trim() || null,
          category,
          costPrice: String(parseFloat(costWithTax || costPrice) || 0),
          costWithoutTax: String(parseFloat(costWithoutTax) || 0),
          costWithTax: String(parseFloat(costWithTax || costPrice) || 0),
          taxRate: hasPurchaseTax ? String(purchaseTaxPercent) : '0.00',
          hasPurchaseTax,
          purchaseTaxPercent: hasPurchaseTax ? purchaseTaxPercent : 0,
          applySaleTax,
          saleTaxPercent,
          salePrice: String(parseFloat(salePrice) || 0),
          discountPercent: Math.max(0, Math.min(100, Number(discountPercent) || 0)),
          stock: Number(stock),
          imageUrl: effectiveCover,
          images: allPhotos,
          videoUrl: videoUrl.trim() || null,
          supplierName: supplierName.trim(),
          description: description.trim(),
          tags: tags.trim(),
          extractedAttributes: JSON.stringify(mergedAttributes),
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar el producto');
      }

      onSaved();
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const costWithoutNum = parseFloat(costWithoutTax) || 0;
  const activePurchaseTax = hasPurchaseTax ? purchaseTaxPercent : 0;
  const purchaseTaxAmount = costWithoutNum * (activePurchaseTax / 100);
  const costTotalPaidToSupplier = costWithoutNum + purchaseTaxAmount;

  const pvpListaNum = parseFloat(salePrice) || 0;
  const activeSaleTax = applySaleTax ? saleTaxPercent : 0;
  const publishedPriceSinIVA = activeSaleTax > 0
    ? pvpListaNum / (1 + activeSaleTax / 100)
    : pvpListaNum;

  const discountNum = Math.max(0, Math.min(99, Number(discountPercent) || 0));
  const discountRate = discountNum / 100;
  const discountAmountSinIVA = publishedPriceSinIVA * discountRate;
  const baseImponibleAfterDiscount = publishedPriceSinIVA - discountAmountSinIVA;

  const saleTaxAmount = activeSaleTax > 0
    ? baseImponibleAfterDiscount * (activeSaleTax / 100)
    : 0;

  const totalClientePaid = baseImponibleAfterDiscount + saleTaxAmount;
  const unitProfit = baseImponibleAfterDiscount - costWithoutNum;
  const calculatedMarginPercent = costWithoutNum > 0 ? (unitProfit / costWithoutNum) * 100 : 0;

  // Aliases for full JSX backward compatibility
  const salePriceWithoutTax = publishedPriceSinIVA;
  const pvpNum = pvpListaNum;
  const effectivePvp = totalClientePaid;
  const effectiveUnitProfit = unitProfit;
  const effectiveMarginPercent = calculatedMarginPercent;
  const effectiveSalePriceWithoutTax = baseImponibleAfterDiscount;

  // Breakdown for Tax / Tributary
  const ivaCreditoCompra = purchaseTaxAmount;
  const ivaDebitoVenta = saleTaxAmount;
  const ivaNetoPorPagar = ivaDebitoVenta - ivaCreditoCompra;

  const isLoss = unitProfit < -0.001;
  const isBreakEven = Math.abs(unitProfit) <= 0.001 && costWithoutNum > 0;

  // Extract all available photos for the item (merging cover + extraImages)
  const allAvailablePhotos: string[] = [];
  if (imageUrl && !allAvailablePhotos.includes(imageUrl)) {
    allAvailablePhotos.push(imageUrl);
  }
  extraImages.forEach((img) => {
    if (img && !allAvailablePhotos.includes(img)) allAvailablePhotos.push(img);
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl relative max-h-[92vh] flex flex-col text-slate-800 overflow-hidden">
        {/* Header (Barra superior estática) */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Editar Producto en SQL' : 'Nuevo Producto en Inventario'}
              </h2>
              <p className="text-xs text-slate-500">
                {editingItem
                  ? 'Modifica precios, opciones de costo y margen de ganancia en PostgreSQL'
                  : 'Crea un registro con opciones de costo y margen personalizado'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del Producto *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Zapatillas Nike Air Max"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Barcode className="w-3.5 h-3.5 text-sky-600" />
                  <span>Código de Barras (EAN / UPC / Producto)</span>
                </label>
                {barcode.trim() && (
                  <span className="text-[10px] font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                    {barcode.length === 13 ? 'EAN-13' : barcode.length === 12 ? 'UPC-A' : 'CODE-128'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Escanea con pistola o ingresa ej. 7501031311305"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-20 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 placeholder:text-slate-400 transition"
                />
                <button
                  type="button"
                  onClick={() => {
                    // Generate unique EAN-13 compatible or random Code128 numeric barcode
                    const prefix = '786'; // Ecuador country code prefix
                    const random = Math.floor(100000000 + Math.random() * 900000000);
                    const base = `${prefix}${random}`;
                    // Calculate EAN-13 checksum digit
                    let sum = 0;
                    for (let i = 0; i < 12; i++) {
                      sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
                    }
                    const checkDigit = (10 - (sum % 10)) % 10;
                    setBarcode(`${base}${checkDigit}`);
                  }}
                  title="Generar código de barras aleatorio si el producto no trae de fábrica"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-sky-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Auto</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Código físico impreso en la caja/empaque para pistolas lectoras.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Código SKU (Alfanumérico Interno)
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Auto-generado ej. JUA00001 (según proveedor)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 placeholder:text-slate-400 transition"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Identificador interno de catálogo de tu negocio.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Telegram Detected Cost Options Selector & Note (Requirement #1) */}
            {costOptions.length > 0 && (
              <div className="sm:col-span-2 p-3.5 rounded-2xl bg-amber-50/80 border-2 border-amber-300 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 flex items-center space-x-1.5">
                    <Tag className="w-4 h-4 text-amber-600" />
                    <span>Precios de Costo Detectados en Mensaje de Telegram</span>
                  </span>
                  <span className="text-[10px] text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded-md border border-amber-300 font-black">
                    Configuración Exclusiva de Edición
                  </span>
                </div>

                <p className="text-[11px] text-amber-800 leading-tight">
                  Selecciona la opción de costo detectada por Telegram para recalcular automáticamente el precio de venta según tu margen, o introduce un costo personalizado abajo:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {costOptions.map((opt, idx) => {
                    const optPrice = opt.price;
                    const isSelected = Math.abs(parseFloat(costWithTax || costPrice) - optPrice) < 0.01;
                    const optWithout =
                      typeof opt.costWithoutTax === 'number'
                        ? opt.costWithoutTax
                        : optPrice / (1 + taxRate / 100);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectCostOption(opt)}
                        className={`p-2.5 rounded-xl text-left text-xs transition flex items-center justify-between cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-100 border-amber-500 text-amber-950 ring-2 ring-amber-400 font-bold shadow-xs'
                            : 'bg-white border-amber-200 text-slate-700 hover:border-amber-400 hover:bg-amber-50/50'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <p className="font-semibold text-xs truncate">{opt.label}</p>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <span className="text-xs text-amber-900 font-mono font-black">
                              Con IVA: ${optPrice.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              (Sin IVA: ${optWithout.toFixed(2)})
                            </span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1 border-t border-amber-200/80 flex items-center justify-between text-[10px] text-amber-800 font-medium">
                  <span>🔒 Visibilidad y edición de costos protegida exclusivamente en este formulario.</span>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* MÓDULO FINANCIERO: COSTOS, MARGEN Y PRECIO DE VENTA (ALINEADO Y CLARO)    */}
            {/* ========================================================================= */}
            <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3.5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shadow-2xs">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <span>Estructura de Costos y Margen de Ganancia</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Gestiona el costo de compra, define el margen comercial y calcula el PVP con ganancia unitaria en tiempo real.
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${
                  hasPurchaseTax
                    ? 'text-sky-900 bg-sky-100/90 border-sky-300'
                    : 'text-slate-700 bg-slate-200/80 border-slate-300'
                }`}>
                  IVA Compra: {hasPurchaseTax ? `${purchaseTaxPercent}%` : '0% (Sin IVA)'}
                </span>
              </div>

              {/* ========================================================================= */}
              {/* CONFIGURACIÓN DE IVA EN COMPRA (CHECK & PORCENTAJE)                       */}
              {/* ========================================================================= */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  hasPurchaseTax
                    ? 'bg-sky-50/80 border-sky-300 shadow-2xs'
                    : 'bg-slate-50/80 border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Toggle / Checkbox */}
                  <label className="flex items-start sm:items-center space-x-3 cursor-pointer select-none">
                    <div className="relative flex items-center pt-0.5 sm:pt-0">
                      <input
                        type="checkbox"
                        checked={hasPurchaseTax}
                        onChange={(e) => handleToggleHasPurchaseTax(e.target.checked)}
                        className="w-5 h-5 rounded-md text-sky-600 border-slate-300 focus:ring-sky-500 cursor-pointer accent-sky-600 transition"
                      />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-sky-700" />
                          <span>Tiene IVA en Compra</span>
                        </span>
                        {hasPurchaseTax ? (
                          <span className="text-[10px] font-black text-sky-900 bg-sky-100/90 border border-sky-300 px-2 py-0.5 rounded-full font-mono">
                            +{purchaseTaxPercent}% Activo
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                            0% IVA (Costo Neto Leído)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {hasPurchaseTax
                          ? 'El proveedor cobra IVA en la compra. Se desglosa el Costo Sin IVA y Con IVA según la tasa.'
                          : 'Sin IVA en compra (tasa 0% o exento). El costo del producto es exactamente el valor de adquisición neto.'}
                      </p>
                    </div>
                  </label>

                  {/* Campo de porcentaje de IVA para Compra */}
                  <div className="flex items-center space-x-2 pl-8 sm:pl-0 shrink-0">
                    <div className="flex flex-col items-start sm:items-end">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-bold text-slate-700">Tasa IVA Compra:</span>
                        <div className="relative w-20">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            disabled={!hasPurchaseTax}
                            value={purchaseTaxPercent}
                            onChange={(e) => handlePurchaseTaxPercentChange(Math.max(0, Number(e.target.value)))}
                            className={`w-full border rounded-xl pl-2.5 pr-6 py-1.5 text-xs font-mono font-black transition text-center ${
                              hasPurchaseTax
                                ? 'bg-white border-sky-400 text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-500/20 shadow-2xs'
                                : 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                        </div>
                      </div>
                      {/* Botón rápido para restaurar por defecto de Telegram */}
                      <button
                        type="button"
                        onClick={() => handlePurchaseTaxPercentChange(telegramTaxPercent)}
                        title={`Restablecer al IVA por defecto configurado en Telegram (${telegramTaxPercent}%)`}
                        className="text-[10px] text-sky-800 hover:text-sky-950 hover:underline mt-1 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Defecto Telegram:</span>
                        <span className="font-mono font-bold bg-sky-200/70 px-1 py-0.2 rounded text-sky-950">
                          {telegramTaxPercent}%
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Presets rápidos de tasas de IVA y desglose dinámico cuando está activo */}
                {hasPurchaseTax && (
                  <div className="mt-3 pt-2.5 border-t border-sky-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    {/* Botones de tasas rápidas */}
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="text-[10px] font-bold text-sky-900 uppercase tracking-wider">Tasas Rápidas:</span>
                      {[0, 5, 8, 12, 15].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handlePurchaseTaxPercentChange(rate)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                            purchaseTaxPercent === rate
                              ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-100 hover:text-sky-950'
                          }`}
                        >
                          {rate === 0 ? '0% Exento' : `${rate}%`}
                        </button>
                      ))}
                      {telegramTaxPercent !== 15 && telegramTaxPercent !== 12 && telegramTaxPercent !== 8 && telegramTaxPercent !== 5 && telegramTaxPercent !== 0 && (
                        <button
                          type="button"
                          onClick={() => handlePurchaseTaxPercentChange(telegramTaxPercent)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                            purchaseTaxPercent === telegramTaxPercent
                              ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-100'
                          }`}
                        >
                          Telegram ({telegramTaxPercent}%)
                        </button>
                      )}
                    </div>

                    {/* Desglose aritmético en tiempo real */}
                    <div className="flex items-center space-x-2 text-[11px] font-mono bg-white/90 px-2.5 py-1 rounded-lg border border-sky-200 text-slate-700 shadow-2xs">
                      <span>Base Compra: <strong>${(parseFloat(costWithoutTax) || 0).toFixed(2)}</strong></span>
                      <span className="text-sky-700 font-bold">+ IVA ({purchaseTaxPercent}%): <strong>${Math.max(0, (parseFloat(costWithTax || costPrice) || 0) - (parseFloat(costWithoutTax) || 0)).toFixed(2)}</strong></span>
                      <span className="text-slate-400">=</span>
                      <span className="text-slate-900 font-black">Costo Total: ${(parseFloat(costWithTax || costPrice) || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Fila 1: Costos de Adquisición (Sin IVA y Con IVA) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                      <span>Costo Sin IVA ($)</span>
                    </label>
                    <span className="text-[10px] text-emerald-700 font-black">Base para Margen y Utilidad</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costWithoutTax}
                      onChange={(e) => handleCostWithoutTaxChange(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl pl-7 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-mono font-bold transition shadow-2xs"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-amber-950 flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                      <span>Costo Con IVA ($)</span>
                    </label>
                    <span className="text-[10px] text-amber-800 font-bold">Total Pagado al Proveedor</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 text-sm font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costWithTax}
                      onChange={(e) => handleCostWithTaxChange(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl pl-7 pr-3 py-2 text-sm text-amber-950 focus:outline-none focus:border-amber-500 font-mono font-black transition shadow-2xs"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Fila 2: Margen de Ganancia (%) y Precio de Venta Sugerido (PVP) Perfectamente Alineados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {/* Margen de Ganancia */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col justify-between space-y-2.5 shadow-2xs">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                        <Percent className="w-3.5 h-3.5 text-sky-600" />
                        <span>Margen de Ganancia (%)</span>
                      </label>
                      <span className="text-xs font-black text-sky-800 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200 font-mono">
                        +{marginPercent}%
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="relative w-24 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={marginPercent}
                          onChange={(e) => handleMarginChange(Number(e.target.value))}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-2.5 pr-6 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 font-mono font-black transition text-center"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                      </div>

                      {/* Presets de margen */}
                      <div className="flex-1 flex flex-wrap gap-1">
                        {MARGIN_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleMarginChange(p)}
                            className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition cursor-pointer shrink-0 ${
                              marginPercent === p
                                ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-300'
                            }`}
                          >
                            +{p}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Aumenta o reduce el porcentaje para recalcular el PVP y tu margen neto.
                  </p>
                </div>

                {/* Precio de Venta Sugerido (PVP) - Panel Resaltado y Llamativo */}
                <div className="p-3.5 rounded-xl bg-gradient-to-b from-emerald-50/90 via-emerald-50/30 to-white border-2 border-emerald-500 flex flex-col justify-between space-y-2.5 shadow-sm ring-2 ring-emerald-500/10 transition">
                  <div>
                    <div className="flex justify-between items-center mb-1.5 flex-wrap gap-1.5">
                      <label className="text-xs font-black text-emerald-950 flex items-center space-x-1.5 tracking-tight">
                        <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-600 text-white shadow-2xs shrink-0">
                          <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
                        </span>
                        <span>Precio de Venta Sugerido (PVP)</span>
                      </label>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleQuoteMarketEcuador}
                          disabled={isQuotingMarket}
                          className={`inline-flex items-center space-x-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer shadow-2xs ${
                            isQuotingMarket
                              ? 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
                              : 'bg-white hover:bg-sky-50 text-sky-800 border-sky-300 hover:border-sky-400'
                          }`}
                          title="Cotizar este producto en el mercado de Ecuador con IA y Google Search"
                        >
                          {isQuotingMarket ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                              <span>Cotizando en Ecuador...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-sky-600" />
                              <span>Cotizar en Ecuador (IA)</span>
                            </>
                          )}
                        </button>
                        <span className="text-[10px] font-black text-emerald-900 bg-emerald-200/80 px-2 py-0.5 rounded-md border border-emerald-300 uppercase tracking-wide">
                          Al Público
                        </span>
                      </div>
                    </div>

                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 text-lg font-black font-mono select-none">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={salePrice}
                        onChange={(e) => handleSalePriceChange(e.target.value)}
                        className="w-full bg-white border-2 border-emerald-500 rounded-xl pl-8 pr-3.5 py-2 text-lg text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono font-black transition shadow-xs"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800 font-medium">
                    Si ingresas un precio manual, el margen (%) se recalcula automáticamente.
                  </p>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* FICHA DE COTIZACIÓN DE MERCADO EN ECUADOR (GOOGLE SEARCH GROUNDING + IA)  */}
              {/* ========================================================================= */}
              {showQuoteDrawer && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-sky-950 text-white border border-sky-700/50 shadow-lg relative overflow-hidden transition-all">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5 mb-3 relative z-10">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🇪🇨</span>
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>Cotización en Tiempo Real - Mercado Ecuador</span>
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30">
                            Google Search + IA
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-300">
                          Precios referenciales en USD en tiendas locales, distribuidores y marketplaces ecuatorianos
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={handleQuoteMarketEcuador}
                        disabled={isQuotingMarket}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Actualizar cotización"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isQuotingMarket ? 'animate-spin text-sky-400' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQuoteDrawer(false)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Cerrar cotización"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isQuotingMarket ? (
                    <div className="py-8 flex flex-col items-center justify-center space-y-3 relative z-10">
                      <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                      <div className="text-center">
                        <p className="text-xs font-bold text-white">Consultando precios en vivo en Ecuador...</p>
                        <p className="text-[11px] text-slate-300 max-w-sm mt-1">
                          Rastreando Mercado Libre Ecuador, distribuidores de Quito/Guayaquil y tiendas online con búsqueda de Google.
                        </p>
                      </div>
                    </div>
                  ) : marketQuoteError ? (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start space-x-2 relative z-10">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-rose-300">Aviso sobre la cotización</p>
                        <p className="text-[11px] text-rose-200/90 mt-0.5">{marketQuoteError}</p>
                        <button
                          type="button"
                          onClick={handleQuoteMarketEcuador}
                          className="mt-2 text-[11px] font-bold text-white underline hover:text-rose-100 cursor-pointer"
                        >
                          Reintentar cotización
                        </button>
                      </div>
                    </div>
                  ) : marketQuote ? (
                    <div className="space-y-3 relative z-10">
                      {/* Rango de Mercado */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
                            Mínimo Local
                          </span>
                          <span className="text-sm font-bold font-mono text-slate-200">
                            ${marketQuote.minMarketPrice.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">Mercado más bajo</span>
                        </div>

                        <div className="bg-sky-950/30 border border-sky-500/40 rounded-xl p-2.5 text-center">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300 block mb-0.5">
                            Promedio EC
                          </span>
                          <span className="text-sm font-black font-mono text-sky-300">
                            ${marketQuote.avgMarketPrice.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-sky-200/70 block mt-0.5">Media ecuatoriana</span>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
                            Máximo Retail
                          </span>
                          <span className="text-sm font-bold font-mono text-slate-200">
                            ${marketQuote.maxMarketPrice.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-slate-400 block mt-0.5">Comercio formal</span>
                        </div>
                      </div>

                      {/* Bloque Destacado: Precio Sugerido y Botón de 1 Clic */}
                      <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-950/70 to-teal-950/70 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-1">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                              PVP Sugerido Competitivo
                            </span>
                            <span className="text-[11px] text-slate-200">
                              Ganancia estimada: <strong className="text-emerald-400 font-mono">+${marketQuote.estimatedProfit.toFixed(2)} USD</strong> (+{marketQuote.profitMarginPercent}%)
                            </span>
                          </div>
                          <div className="flex items-baseline space-x-2 mt-1">
                            <span className="text-2xl font-black font-mono text-emerald-400 tracking-tight">
                              ${marketQuote.suggestedSalePrice.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-300 font-bold">USD</span>
                            <span className="text-[11px] text-slate-400">
                              (Costo base: ${(parseFloat(costWithTax || costPrice) || 0).toFixed(2)})
                            </span>
                          </div>
                        </div>

                        {/* Botón de 1 Clic para autocompletar el PVP */}
                        <button
                          type="button"
                          onClick={() => handleApplySuggestedPrice(marketQuote.suggestedSalePrice)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center space-x-2 shrink-0 cursor-pointer ${
                            appliedPriceFeedback
                              ? 'bg-emerald-400 text-slate-950 border border-emerald-300 shadow-emerald-500/20'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border border-emerald-400 hover:scale-[1.02] active:scale-[0.98]'
                          }`}
                        >
                          {appliedPriceFeedback ? (
                            <>
                              <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                              <span>¡PVP Aplicado al Formulario!</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                              <span>Aplicar ${marketQuote.suggestedSalePrice.toFixed(2)} al PVP</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Resumen del mercado */}
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5 space-y-2">
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {marketQuote.marketSummary}
                        </p>

                        {marketQuote.keyTips && marketQuote.keyTips.length > 0 && (
                          <div className="pt-2 border-t border-white/10">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              Consejos para venta en Ecuador:
                            </span>
                            <ul className="space-y-1">
                              {marketQuote.keyTips.map((tip, i) => (
                                <li key={i} className="text-[11px] text-slate-300 flex items-start space-x-1.5">
                                  <span className="text-emerald-400 font-bold">•</span>
                                  <span>{tip}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Enlaces y fuentes consultadas */}
                      {marketQuote.sources && marketQuote.sources.length > 0 && (
                        <div className="pt-1 flex items-center flex-wrap gap-1.5">
                          <span className="text-[10px] text-slate-400">Fuentes consultadas:</span>
                          {marketQuote.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.url || `https://listado.mercadolibre.com.ec/${encodeURIComponent(name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-[10px] text-sky-300 hover:text-sky-200 bg-sky-950/40 hover:bg-sky-900/60 px-2 py-0.5 rounded-lg border border-sky-700/30 transition cursor-pointer"
                            >
                              <span>{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* ========================================================================= */}
              {/* CONFIGURACIÓN DE IVA PARA VENTA AL PÚBLICO (CHECK & PORCENTAJE)            */}
              {/* ========================================================================= */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  applySaleTax
                    ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                    : 'bg-slate-50/80 border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Toggle / Checkbox */}
                  <label className="flex items-start sm:items-center space-x-3 cursor-pointer select-none">
                    <div className="relative flex items-center pt-0.5 sm:pt-0">
                      <input
                        type="checkbox"
                        checked={applySaleTax}
                        onChange={(e) => handleToggleApplySaleTax(e.target.checked)}
                        className="w-5 h-5 rounded-md text-amber-600 border-slate-300 focus:ring-amber-500 cursor-pointer accent-amber-600 transition"
                      />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-amber-700" />
                          <span>Incrementar IVA para la Venta</span>
                        </span>
                        {applySaleTax ? (
                          <span className="text-[10px] font-black text-amber-900 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded-full font-mono">
                            +{saleTaxPercent}% Activo
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                            Desactivado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {applySaleTax
                          ? 'El PVP incrementa con el IVA de venta para que el cliente final asuma el impuesto.'
                          : 'Venta directa sin incremento de IVA (producto con IVA ya incluido, exento o neto).'}
                      </p>
                    </div>
                  </label>

                  {/* Campo de porcentaje de IVA para Venta */}
                  <div className="flex items-center space-x-2 pl-8 sm:pl-0 shrink-0">
                    <div className="flex flex-col items-start sm:items-end">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[11px] font-bold text-slate-700">Tasa IVA Venta:</span>
                        <div className="relative w-20">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            disabled={!applySaleTax}
                            value={saleTaxPercent}
                            onChange={(e) => handleSaleTaxPercentChange(Math.max(0, Number(e.target.value)))}
                            className={`w-full border rounded-xl pl-2.5 pr-6 py-1.5 text-xs font-mono font-black transition text-center ${
                              applySaleTax
                                ? 'bg-white border-amber-400 text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500/20 shadow-2xs'
                                : 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                        </div>
                      </div>
                      {/* Botón rápido para restaurar por defecto de Telegram */}
                      <button
                        type="button"
                        onClick={() => handleSaleTaxPercentChange(telegramTaxPercent)}
                        title={`Restablecer al IVA por defecto configurado en Telegram (${telegramTaxPercent}%)`}
                        className="text-[10px] text-amber-800 hover:text-amber-950 hover:underline mt-1 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Defecto Telegram:</span>
                        <span className="font-mono font-bold bg-amber-200/70 px-1 py-0.2 rounded text-amber-950">
                          {telegramTaxPercent}%
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Presets rápidos de tasas de IVA y desglose dinámico cuando está activo */}
                {applySaleTax && (
                  <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    {/* Botones de tasas rápidas */}
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Tasas Rápidas:</span>
                      {[0, 5, 8, 12, 15].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => handleSaleTaxPercentChange(rate)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                            saleTaxPercent === rate
                              ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100 hover:text-amber-950'
                          }`}
                        >
                          {rate === 0 ? '0% Exento' : `${rate}%`}
                        </button>
                      ))}
                      {telegramTaxPercent !== 15 && telegramTaxPercent !== 12 && telegramTaxPercent !== 8 && telegramTaxPercent !== 5 && telegramTaxPercent !== 0 && (
                        <button
                          type="button"
                          onClick={() => handleSaleTaxPercentChange(telegramTaxPercent)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                            saleTaxPercent === telegramTaxPercent
                              ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          Telegram ({telegramTaxPercent}%)
                        </button>
                      )}
                    </div>

                    {/* Desglose aritmético en tiempo real */}
                    <div className="flex items-center space-x-2 text-[11px] font-mono bg-white/90 px-2.5 py-1 rounded-lg border border-amber-200 text-slate-700 shadow-2xs">
                      <span>Base Sin IVA: <strong>${salePriceWithoutTax.toFixed(2)}</strong></span>
                      <span className="text-amber-700 font-bold">+ IVA Venta ({saleTaxPercent}%): <strong>${saleTaxAmount.toFixed(2)}</strong></span>
                      <span className="text-slate-400">=</span>
                      <span className="text-emerald-800 font-black">PVP: ${pvpNum.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ========================================================================= */}
              {/* RESALTADO VISUAL: UTILIDAD REAL Y DESGLOSE CONTABLE (11 PUNTOS CLAVE)      */}
              {/* ========================================================================= */}
              <div
                className={`rounded-2xl p-4 transition-all border-2 shadow-sm ${
                  isLoss
                    ? 'bg-rose-50/95 border-rose-400 text-rose-950'
                    : isBreakEven
                    ? 'bg-amber-50/95 border-amber-400 text-amber-950'
                    : 'bg-gradient-to-br from-emerald-50 via-teal-50/40 to-emerald-100/60 border-emerald-500 shadow-emerald-500/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Icono y Título */}
                  <div className="flex items-center space-x-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-xs ${
                        isLoss
                          ? 'bg-rose-500 text-white border-rose-600'
                          : isBreakEven
                          ? 'bg-amber-500 text-white border-amber-600'
                          : 'bg-emerald-600 text-white border-emerald-700 ring-4 ring-emerald-100'
                      }`}
                    >
                      {isLoss ? (
                        <AlertTriangle className="w-6 h-6 animate-pulse text-amber-200" />
                      ) : isBreakEven ? (
                        <Scale className="w-6 h-6" />
                      ) : (
                        <TrendingUp className="w-6 h-6 stroke-[2.5]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                          Utilidad Real por Venta
                        </span>
                        {isLoss ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white">
                            Venta en Pérdida
                          </span>
                        ) : isBreakEven ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-600 text-white">
                            Punto de Equilibrio
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            <span>Margen Positivo ({calculatedMarginPercent.toFixed(0)}%)</span>
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5">
                        {discountNum > 0
                          ? 'Ganancia Neta tras Descuento en Tienda:'
                          : 'Ganancia Calculada por Unidad Vendida:'}
                      </h4>
                    </div>
                  </div>

                  {/* Right: Cifra Grande y Notoria */}
                  <div className="sm:text-right flex flex-col sm:items-end">
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                          isLoss
                            ? 'text-rose-600'
                            : isBreakEven
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {isLoss
                          ? `-$${Math.abs(effectiveUnitProfit).toFixed(2)}`
                          : isBreakEven
                          ? '$0.00'
                          : `+$${effectiveUnitProfit.toFixed(2)}`}
                      </span>
                      <span className="text-xs font-bold text-slate-600 uppercase">
                        / unidad
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`text-xs font-black font-mono px-2.5 py-0.5 rounded-md border ${
                          isLoss
                            ? 'text-rose-800 bg-rose-100 border-rose-300'
                            : isBreakEven
                            ? 'text-amber-800 bg-amber-100 border-amber-300'
                            : 'text-emerald-800 bg-emerald-100/90 border-emerald-300 shadow-2xs'
                        }`}
                      >
                        {isLoss
                          ? `${effectiveMarginPercent.toFixed(1)}% margen`
                          : isBreakEven
                          ? '0% margen'
                          : `+${effectiveMarginPercent.toFixed(1)}% margen sobre costo neto`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Desglose Matemático Coherente */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap font-mono font-medium text-slate-700">
                    <span className="text-slate-500 font-sans font-semibold text-[11px]">Fórmula:</span>
                    <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900 shadow-2xs">
                      Venta Sin IVA (${effectiveSalePriceWithoutTax.toFixed(2)})
                    </span>
                    <span className="text-slate-400 font-bold">-</span>
                    <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-900 shadow-2xs" title="Costo Neto de compra sin IVA (crédito tributario)">
                      Costo Neto Sin IVA (${costWithoutNum.toFixed(2)})
                    </span>
                    <span className="text-slate-400 font-bold">=</span>
                    <span
                      className={`px-2 py-0.5 rounded-md border font-black shadow-2xs ${
                        isLoss
                          ? 'bg-rose-100 text-rose-700 border-rose-300'
                          : isBreakEven
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      Utilidad: {isLoss ? `-$${Math.abs(effectiveUnitProfit).toFixed(2)}` : `+$${effectiveUnitProfit.toFixed(2)}`} / u
                    </span>
                  </div>

                  {applySaleTax ? (
                    <span className="text-[11px] font-medium text-amber-950 bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200">
                      💡 PVP con IVA: ${pvpNum.toFixed(2)} (IVA Venta: +${saleTaxAmount.toFixed(2)} asumido por cliente).
                    </span>
                  ) : discountNum > 0 ? (
                    <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                      🔥 Oferta -{discountNum}% aplicada (PVP regular: ${pvpNum.toFixed(2)} → Ganancia normal: +${unitProfit.toFixed(2)}/u)
                    </span>
                  ) : null}
                </div>
              </div>

              {/* ========================================================================= */}
              {/* DESGLOSE CONTABLE & COMERCIAL COMPLETO (11 PUNTOS CLAVE OBLIGATORIOS)       */}
              {/* ========================================================================= */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 text-white border border-indigo-700/40 shadow-lg space-y-3.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-white">
                        Desglose Contable, Fiscal y de Utilidad Real (11 Puntos)
                      </h4>
                      <p className="text-[10px] text-slate-300">
                        Separación clara de IVA crédito, IVA débito, costos y ganancia neta.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    Lógica Fiscal Correcta
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {/* 1. Costo Neto (Sin IVA) */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">1. Costo Neto (Sin IVA)</span>
                    <span className="text-base font-black font-mono text-slate-100">${costWithoutNum.toFixed(2)}</span>
                    <span className="text-[9px] text-slate-400">Base para margen y utilidad</span>
                  </div>

                  {/* 2. IVA Pagado en Compra */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">2. IVA Compra ({activePurchaseTax}%)</span>
                    <span className="text-base font-black font-mono text-sky-300">${purchaseTaxAmount.toFixed(2)}</span>
                    <span className="text-[9px] text-sky-200/70">Crédito tributario a favor</span>
                  </div>

                  {/* 3. Costo Total Proveedor */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">3. Total al Proveedor</span>
                    <span className="text-base font-black font-mono text-amber-300">${costTotalPaidToSupplier.toFixed(2)}</span>
                    <span className="text-[9px] text-amber-200/70">Desembolso total de compra</span>
                  </div>

                  {/* 4. Margen de Ganancia */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">4. Margen Ganancia</span>
                    <span className="text-base font-black font-mono text-teal-300">+{marginPercent}%</span>
                    <span className="text-[9px] text-teal-200/70">Sobre costo neto sin IVA</span>
                  </div>

                  {/* 5. Precio Venta Sin IVA */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">5. Precio Venta Sin IVA</span>
                    <span className="text-base font-black font-mono text-emerald-300">${salePriceWithoutTax.toFixed(2)}</span>
                    <span className="text-[9px] text-emerald-200/70">Costo Neto + Utilidad</span>
                  </div>

                  {/* 6. IVA de Venta */}
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">6. IVA Venta ({activeSaleTax}%)</span>
                    <span className="text-base font-black font-mono text-amber-300">${saleTaxAmount.toFixed(2)}</span>
                    <span className="text-[9px] text-amber-200/70">Débito fiscal cobrado al cliente</span>
                  </div>

                  {/* 7. Precio Final / PVP */}
                  <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col justify-between">
                    <span className="text-[10px] text-emerald-300 font-bold uppercase">7. PVP Final (Con IVA)</span>
                    <span className="text-lg font-black font-mono text-emerald-400">${pvpNum.toFixed(2)}</span>
                    <span className="text-[9px] text-emerald-200/80">Precio final al consumidor</span>
                  </div>

                  {/* 8. IVA Crédito (Compra) */}
                  <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/40 flex flex-col justify-between">
                    <span className="text-[10px] text-sky-300 font-bold uppercase">8. IVA Crédito (Compra)</span>
                    <span className="text-base font-black font-mono text-sky-300">${ivaCreditoCompra.toFixed(2)}</span>
                    <span className="text-[9px] text-sky-200/80">A tu favor (Deducible)</span>
                  </div>

                  {/* 9. IVA Débito (Venta) */}
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 flex flex-col justify-between">
                    <span className="text-[10px] text-amber-300 font-bold uppercase">9. IVA Débito (Venta)</span>
                    <span className="text-base font-black font-mono text-amber-300">${ivaDebitoVenta.toFixed(2)}</span>
                    <span className="text-[9px] text-amber-200/80">Generado en la venta</span>
                  </div>
                </div>

                {/* Fila Inferior Destacada: 10. IVA Neto por Pagar & 11. Utilidad Real */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
                  {/* 10. IVA Neto por Pagar */}
                  <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-400/40 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">
                        10. IVA Neto a Declarar / Pagar
                      </span>
                      <span className="text-[11px] text-slate-300">
                        (Débito ${ivaDebitoVenta.toFixed(2)} - Crédito ${ivaCreditoCompra.toFixed(2)})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-black font-mono ${ivaNetoPorPagar >= 0 ? 'text-indigo-300' : 'text-emerald-400'}`}>
                        ${Math.abs(ivaNetoPorPagar).toFixed(2)}
                      </span>
                      <span className="text-[9px] text-slate-300 block font-bold">
                        {ivaNetoPorPagar >= 0 ? 'Por Pagar al Fisco' : 'Crédito a Favor'}
                      </span>
                    </div>
                  </div>

                  {/* 11. Utilidad Real del Producto */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-900/90 border-2 border-emerald-400 flex items-center justify-between shadow-md">
                    <div>
                      <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider block flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>11. Utilidad Real del Producto</span>
                      </span>
                      <span className="text-[11px] text-emerald-100 font-medium">
                        Venta sin IVA (${salePriceWithoutTax.toFixed(2)}) - Costo sin IVA (${costWithoutNum.toFixed(2)})
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black font-mono text-emerald-400">
                        ${unitProfit.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-200 block font-mono">
                        Margen {calculatedMarginPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Descuento por Porcentaje en Oferta (Tienda Online) */}
            <div className="sm:col-span-2 p-3.5 rounded-2xl bg-gradient-to-r from-rose-50/80 via-rose-50/40 to-amber-50/60 border border-rose-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-rose-950 flex items-center space-x-1.5">
                  <BadgePercent className="w-4 h-4 text-rose-600" />
                  <span>Descuento Promocional en Tienda (%)</span>
                </label>
                {discountNum > 0 ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-600 text-white shadow-2xs">
                    <Flame className="w-3 h-3 fill-current animate-pulse text-amber-300" />
                    <span>OFERTA -{discountNum}%</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Sin oferta (0%)
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={discountPercent}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                      handleDiscountChange(val);
                    }}
                    placeholder="0"
                    className="w-24 bg-white border border-rose-300 rounded-xl px-3 py-2 text-sm text-rose-950 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono transition shadow-2xs"
                  />
                  <span className="text-sm font-bold text-rose-800 font-mono">%</span>
                </div>

                <div className="flex-1 flex space-x-1 overflow-x-auto py-0.5 scrollbar-thin">
                  {DISCOUNT_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDiscountChange(d)}
                      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition cursor-pointer flex-shrink-0 ${
                        discountNum === d
                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300'
                      }`}
                    >
                      {d === 0 ? '0% (Normal)' : `-${d}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Price Preview & Profit / Loss Status */}
              {discountNum > 0 ? (
                <div className="space-y-2">
                  <div className="p-3 bg-white rounded-xl border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500 font-medium">PVP Normal:</span>
                      <span className="line-through text-slate-400 font-mono font-medium">${pvpNum.toFixed(2)}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-rose-950 font-bold">Precio Oferta:</span>
                      <span className="font-black text-rose-600 text-sm font-mono">${effectivePvp.toFixed(2)}</span>
                    </div>

                    {isLoss ? (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-black text-rose-700 font-mono bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-300 animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>PÉRDIDA: -${Math.abs(effectiveUnitProfit).toFixed(2)}/u</span>
                      </span>
                    ) : isBreakEven ? (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-amber-800 font-mono bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                        <Scale className="w-3.5 h-3.5 text-amber-700" />
                        <span>EQUILIBRIO: $0.00/u</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-800 font-mono bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Ganancia tras oferta: +${effectiveUnitProfit.toFixed(2)}/u ({effectiveMarginPercent.toFixed(1)}%)</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 font-medium">
                  💡 Los productos con descuento ({'>'} 0%) se mostrarán <strong>primero en la tienda online</strong> con una etiqueta llamativa de <strong>OFERTA</strong>.
                </p>
              )}
            </div>

            {/* Panel de Existencias & Stock (Requirement #3) */}
            <div className="sm:col-span-2 space-y-2 p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-sky-600" />
                  <span>Panel de Existencias & Stock</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Control por Compras</span>
                </span>
              </div>

              {/* Enhanced Stock Breakdown Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-xl bg-sky-50/80 border border-sky-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-sky-800 flex items-center gap-1">
                      <Boxes className="w-3 h-3 text-sky-600" />
                      <span>Físico</span>
                    </span>
                    <span className="text-xs font-black text-sky-950 font-mono">
                      {editingItem?.physicalStock ?? stock} u.
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                      <PackageCheck className="w-3 h-3 text-emerald-600" />
                      <span>Disponible</span>
                    </span>
                    <span className="text-xs font-black text-emerald-950 font-mono">
                      {editingItem?.availableStock ?? stock} u.
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-800 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>Reservado</span>
                    </span>
                    <span className="text-xs font-black text-amber-950 font-mono">
                      {editingItem?.reservedStock ?? 0} u.
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-800 flex items-center gap-1">
                      <Truck className="w-3 h-3 text-indigo-600" />
                      <span>Por Recibir</span>
                    </span>
                    <span className="text-xs font-black text-indigo-950 font-mono">
                      +{editingItem?.incomingStock ?? 0} u.
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 leading-tight">
                ℹ️ El stock se actualiza mediante compras recibidas o pedidos despachados.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Estado de Disponibilidad
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition font-medium"
              >
                <option value="available">🟢 Activo (Disponible)</option>
                <option value="low_stock">🟡 Stock Bajo</option>
                <option value="sold_out">🔴 Agotado</option>
                <option value="archived">⏸️ Desactivado (Inactivo)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Proveedor
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              />
            </div>

            {/* Photo / Image Upload Section */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-600" />
                  <span>Fotos del Producto</span>
                  {allAvailablePhotos.length > 0 && (
                    <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                      {allAvailablePhotos.length} foto{allAvailablePhotos.length === 1 ? '' : 's'}
                    </span>
                  )}
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowWebImagePicker(true)}
                    className="text-[11px] text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 font-bold px-2.5 py-1 rounded-xl flex items-center space-x-1 cursor-pointer transition shadow-2xs"
                    title="Buscar fotos oficiales del producto en Google/Bing con IA"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>🔍 Buscar fotos con IA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 font-bold px-2.5 py-1 rounded-xl flex items-center space-x-1 cursor-pointer transition shadow-2xs"
                    title="Subir una o varias fotos desde tu equipo o celular"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-sky-600" />
                    <span>+ Subir locales</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-medium flex items-center space-x-1 cursor-pointer"
                  >
                    <LinkIcon className="w-3 h-3" />
                    <span>{showUrlInput ? 'Ocultar URL' : 'O URL'}</span>
                  </button>
                </div>
              </div>

              {/* Hidden multi-file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />

              {allAvailablePhotos.length > 0 ? (
                /* Interactive Photo Gallery with Cover Selector */
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-600 pb-1 border-b border-slate-200 flex-wrap gap-2">
                    <span className="flex items-center space-x-1.5 font-medium">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>Haz clic en <strong>⭐ Portada</strong> para elegir cuál es la foto principal visible.</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-800 hover:underline flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Agregar más fotos</span>
                    </button>
                  </div>

                  {/* Responsive Grid of Product Photos */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {allAvailablePhotos.map((photo, pIdx) => {
                      const isCover = photo === (imageUrl || allAvailablePhotos[0]);
                      return (
                        <div
                          key={pIdx}
                          className={`relative rounded-xl overflow-hidden border-2 transition group flex flex-col bg-white shadow-2xs ${
                            isCover
                              ? 'border-emerald-500 ring-2 ring-emerald-300/80 shadow-xs'
                              : 'border-slate-200 hover:border-sky-300'
                          }`}
                        >
                          {/* Photo Thumbnail */}
                          <div
                            className="relative aspect-square w-full bg-slate-100 cursor-zoom-in overflow-hidden"
                            onClick={() => {
                              setLightboxIndex(pIdx);
                              setIsLightboxOpen(true);
                            }}
                            title="Haz clic para agrandar foto en tamaño completo"
                          >
                            <img
                              src={photo}
                              alt={`Foto ${pIdx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              referrerPolicy="no-referrer"
                            />

                            {/* Zoom overlay */}
                            <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ZoomIn className="w-5 h-5 drop-shadow" />
                            </div>

                            {/* Cover Badge */}
                            {isCover ? (
                              <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black tracking-wide shadow-md flex items-center space-x-1">
                                <Star className="w-3 h-3 fill-white text-white" />
                                <span>PORTADA</span>
                              </div>
                            ) : (
                              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-slate-900/60 text-white text-[9px] font-bold backdrop-blur-xs">
                                #{pIdx + 1}
                              </div>
                            )}

                            {/* Delete button: Trash icon only */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePhoto(photo);
                              }}
                              className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white shadow-md transition cursor-pointer"
                              title="Eliminar esta foto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Cover selection action bar at bottom of card */}
                          <div className="p-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
                            {isCover ? (
                              <span className="text-[10px] font-extrabold text-emerald-700 flex items-center space-x-1">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Foto de Portada</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetAsCover(photo)}
                                className="w-full py-1 px-1.5 rounded-lg bg-white hover:bg-amber-50 hover:text-amber-700 border border-slate-200 text-slate-700 text-[10px] font-bold transition flex items-center justify-center space-x-1 cursor-pointer shadow-2xs"
                                title="Establecer como portada principal visible del producto"
                              >
                                <Star className="w-3 h-3 text-amber-500" />
                                <span>Elegir portada</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick upload tile in the grid */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50/50 hover:bg-sky-50/90 transition flex flex-col items-center justify-center p-2 text-center cursor-pointer text-sky-700 group shadow-2xs"
                      title="Seleccionar más fotos desde tu dispositivo"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-sky-200 flex items-center justify-center group-hover:scale-110 transition shadow-2xs">
                        <Plus className="w-4 h-4 text-sky-600" />
                      </div>
                      <span className="text-[11px] font-bold mt-1.5 leading-tight">+ Subir más fotos</span>
                      <span className="text-[9px] text-sky-600/80 mt-0.5">Múltiples archivos</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Empty Dropzone for multiple files */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center space-y-2 ${
                    isDragging
                      ? 'border-sky-500 bg-sky-50/70 text-sky-800 scale-[0.99]'
                      : 'border-slate-300 hover:border-sky-400 bg-slate-50/70 hover:bg-sky-50/30 text-slate-600'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-sky-600 shadow-2xs">
                    {isProcessingPhoto ? (
                      <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                    ) : (
                      <UploadCloud className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {isProcessingPhoto
                        ? 'Procesando imágenes...'
                        : 'Haz clic aquí o arrastra fotos para subirlas'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Puedes subir múltiples fotos locales a la vez y seleccionar cuál es la portada
                    </p>
                  </div>
                  <div className="pt-1 flex items-center space-x-2 flex-wrap justify-center gap-y-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowWebImagePicker(true);
                      }}
                      className="inline-flex items-center px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Buscar Fotos con IA
                    </button>
                    <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 shadow-2xs transition">
                      <ImagePlus className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                      Subir Fotos Locales
                    </span>
                  </div>
                </div>
              )}

              {/* Direct URL input if toggled */}
              {showUrlInput && (
                <div className="pt-1 animate-fadeIn">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={directUrl}
                      onChange={(e) => setDirectUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDirectUrl();
                        }
                      }}
                      placeholder="https://ejemplo.com/foto-producto.jpg"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
                    />
                    <button
                      type="button"
                      onClick={handleAddDirectUrl}
                      className="px-3 py-2 text-xs font-bold bg-sky-600 text-white hover:bg-sky-500 rounded-xl transition cursor-pointer shrink-0"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Etiquetas / Tags (separados por coma)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="zapatillas, running, deporte, negro"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 transition"
              />
            </div>

            {/* Panel: Mensaje Original Recibido de Telegram (Situado antes de la Descripción Comercial) */}
            {rawTelegramMessage && (
              <div className="sm:col-span-2 rounded-2xl bg-sky-50/75 border border-sky-200 p-4 space-y-2.5 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-xl bg-sky-500/20 text-sky-700 flex items-center justify-center shrink-0 border border-sky-300/40">
                      <Send className="w-3.5 h-3.5 rotate-[-20deg]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                        Mensaje Original Recibido de Telegram
                      </span>
                      <span className="text-[10px] text-sky-700 font-medium block">
                        Texto original enviado por el proveedor
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyTelegramMessage}
                      className="px-2.5 py-1 rounded-xl bg-white hover:bg-sky-100 text-sky-700 text-xs font-semibold border border-sky-200 shadow-2xs transition flex items-center gap-1 cursor-pointer"
                      title="Copiar texto original del mensaje al portapapeles"
                    >
                      {copiedTelegram ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-sky-600" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                    {!description.trim() && (
                      <button
                        type="button"
                        onClick={() => setDescription(rawTelegramMessage)}
                        className="px-2.5 py-1 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                        title="Usar este mensaje como texto base de la descripción"
                      >
                        <span>Usar como descripción</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white/95 rounded-xl border border-sky-100 p-3.5 text-xs text-slate-800 italic leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto select-text font-sans">
                  "{rawTelegramMessage}"
                </div>
              </div>
            )}

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <span>Descripción Comercial</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">
                    IA Gemini
                  </span>
                </label>
                <button
                  type="button"
                  disabled={isGeneratingDescription || !name.trim()}
                  onClick={handleGenerateAiDescription}
                  className="px-2.5 py-1 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 text-[11px] font-bold transition flex items-center space-x-1.5 border border-sky-200 disabled:opacity-50 cursor-pointer shadow-2xs"
                  title={name.trim() ? "Generar descripción comercial con IA (150 a 200 palabras, hasta 8 viñetas de características)" : "Ingresa el nombre del producto primero"}
                >
                  {isGeneratingDescription ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span>
                    {isGeneratingDescription
                      ? 'Generando con IA...'
                      : description
                      ? 'Regenerar con IA ✨'
                      : 'Generar con IA ✨'}
                  </span>
                </button>
              </div>

              {descSuccessMsg && (
                <div className="mb-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-1.5 animate-fadeIn font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <span>{descSuccessMsg}</span>
                </div>
              )}

              <textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción comercial atractiva (haz clic en 'Generar con IA' para redactarla automáticamente con entre 150 y 200 palabras y hasta 8 viñetas de características)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-500 resize-y transition"
              />
            </div>

            {/* Video del Producto Section (Híbrido: Enlace YouTube/TikTok/Reels, Subir MP4 o Buscar con IA) */}
            <div className="sm:col-span-2 space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Film className="w-3.5 h-3.5 text-sky-600" />
                  <span>Añade un Video de YouTube, TikTok, Shorts o sube MP4</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Híbrido + IA
                  </span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowVideoUrlInput(!showVideoUrlInput)}
                    className="text-[11px] text-sky-700 hover:text-sky-800 font-medium hover:underline flex items-center space-x-1 cursor-pointer"
                  >
                    <LinkIcon className="w-3 h-3" />
                    <span>{showVideoUrlInput ? 'Ocultar Enlace' : 'Pegar Enlace'}</span>
                  </button>
                </div>
              </div>

              {videoUrl ? (
                /* Active Video Card with preview and actions */
                <div className="p-3.5 bg-slate-900 border border-slate-800 text-white rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400 flex-shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-400/20 text-sky-300 border border-sky-400/30">
                            {parseVideoUrl(videoUrl).platform.toUpperCase()}
                          </span>
                          <span className="text-xs font-bold text-slate-200">Video Activo</span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-sm font-mono mt-0.5">
                          {videoUrl}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0">
                      {editingItem && (
                        <button
                          type="button"
                          onClick={() => setIsVideoPickerOpen(true)}
                          className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Buscar / Cambiar con IA</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setVideoUrl('')}
                        className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 transition cursor-pointer"
                        title="Quitar video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Embed Video Preview (Paused by default on modal open) */}
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black/80 border border-slate-800 flex items-center justify-center relative">
                    {!isPlayingVideoPreview ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4 text-center">
                        {parseVideoUrl(videoUrl)?.thumbnailUrl && (
                          <img
                            src={parseVideoUrl(videoUrl)?.thumbnailUrl}
                            alt="Video Thumbnail"
                            className="absolute inset-0 w-full h-full object-cover opacity-30"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setIsPlayingVideoPreview(true)}
                          className="relative z-10 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center space-x-2 shadow-lg transition active:scale-95 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>Reproducir Video</span>
                        </button>
                        <span className="relative z-10 text-[11px] text-slate-400 mt-2">
                          El video no se reproduce automáticamente al abrir el modal.
                        </span>
                      </div>
                    ) : parseVideoUrl(videoUrl, { autoplay: false })?.isDirect ? (
                      <video
                        src={parseVideoUrl(videoUrl, { autoplay: false })?.embedUrl}
                        controls
                        autoPlay={true}
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    ) : parseVideoUrl(videoUrl, { autoplay: true })?.embedUrl ? (
                      <iframe
                        src={parseVideoUrl(videoUrl, { autoplay: true })?.embedUrl}
                        title="Product Video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    ) : (
                      <div className="text-xs text-slate-400 p-4 text-center">
                        Vista previa no disponible para este formato, pero el video se mostrará a los clientes.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* No video assigned yet: show AI search button, paste link, or upload */
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600 flex-shrink-0">
                      <Film className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Añade un video de YouTube, TikTok, Shorts o sube un MP4
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Los productos con video tienen hasta 4x más conversiones en la tienda.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 w-full sm:w-auto">
                    {editingItem ? (
                      <button
                        type="button"
                        onClick={() => setIsVideoPickerOpen(true)}
                        className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Buscar Video con IA</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowVideoUrlInput(true)}
                        className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Pegar Enlace Directo</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Direct manual URL input if toggled */}
              {showVideoUrlInput && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-fadeIn">
                  <label className="block text-[11px] font-bold text-slate-700">
                    URL de YouTube, YouTube Shorts, TikTok, Reels, Vimeo o MP4:
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... o https://www.tiktok.com/@..."
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500 transition"
                    />
                    {videoUrl && (
                      <button
                        type="button"
                        onClick={() => setVideoUrl('')}
                        className="px-2.5 py-2 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI Generation Assistant Section at the bottom of edit product modal */}
          {editingItem && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-500/10 via-indigo-500/10 to-purple-500/10 border-2 border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span>Asistente de generación con IA</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.2 rounded-full border border-indigo-200">
                      1 Clic
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-tight">
                    Genera copys persuasivos, fichas técnicas, hashtags y busca fotos en HD de la web con IA.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMarketingModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-black shadow-xs flex items-center space-x-1.5 transition cursor-pointer shrink-0 w-full sm:w-auto justify-center active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Abrir Asistente IA ✨</span>
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          </div>

          {/* Static Bottom Action Bar (Barra inferior estática) */}
          <div className="flex-shrink-0 bg-slate-50/95 backdrop-blur-xs border-t border-slate-200 px-5 sm:px-6 py-3.5 flex items-center justify-end space-x-3 shadow-2xs">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/70 transition cursor-pointer font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm transition flex items-center space-x-2 shadow-xs disabled:opacity-50 cursor-pointer active:scale-98"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{editingItem ? 'Guardar Cambios' : 'Crear Producto'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Full Resolution Photo Lightbox Modal */}
      {isLightboxOpen && (
        <ImageLightboxModal
          isOpen={isLightboxOpen}
          images={allAvailablePhotos}
          currentIndex={lightboxIndex}
          onClose={() => setIsLightboxOpen(false)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
          onSelect={(selectedUrl) => {
            setImageUrl(selectedUrl);
            setIsLightboxOpen(false);
          }}
          selectLabel="Usar como Foto del Producto"
          productName={name || editingItem?.name || 'Producto'}
          productSku={sku || editingItem?.sku || ''}
          isCover={allAvailablePhotos[lightboxIndex] === imageUrl}
        />
      )}

      {/* AI & Hybrid Video Picker Modal */}
      {isVideoPickerOpen && editingItem && (
        <ProductAiVideoPickerModal
          item={{ ...editingItem, videoUrl }}
          isOpen={isVideoPickerOpen}
          onClose={() => setIsVideoPickerOpen(false)}
          onVideoApplied={(updated) => {
            if (updated.videoUrl) {
              setVideoUrl(updated.videoUrl);
            }
          }}
        />
      )}

      {/* AI Marketing & Multi-Platform Publishing Modal (Requirement #2) */}
      {showMarketingModal && editingItem && (
        <ProductMarketingCopyModal
          item={{
            ...editingItem,
            name: name || editingItem.name,
            description: description || editingItem.description,
            salePrice: salePrice || editingItem.salePrice,
            costPrice: costPrice || editingItem.costPrice,
            imageUrl: imageUrl || editingItem.imageUrl,
            images: extraImages.length > 0 ? extraImages : editingItem.images,
            videoUrl: videoUrl || editingItem.videoUrl,
            category: category || editingItem.category,
            tags: tags || editingItem.tags,
            stock: stock,
          }}
          onClose={() => setShowMarketingModal(false)}
          onItemUpdated={(updated) => {
            if (updated.description) setDescription(updated.description);
            if (updated.tags) setTags(updated.tags);
            if (updated.imageUrl) setImageUrl(updated.imageUrl);
            if (Array.isArray(updated.images) && updated.images.length > 0) {
              setExtraImages(updated.images);
            }
          }}
        />
      )}

      {/* Web Image Search & Selection Modal */}
      {showWebImagePicker && (
        <ProductWebImagePicker
          item={{
            ...(editingItem || {}),
            id: editingItem?.id,
            name: name || editingItem?.name || 'Producto',
            description: description || editingItem?.description,
            category: category || editingItem?.category,
            imageUrl: imageUrl || editingItem?.imageUrl,
            images: allAvailablePhotos,
            extractedAttributes: editingItem?.extractedAttributes,
            sku: sku || editingItem?.sku,
          }}
          isOpen={showWebImagePicker}
          onClose={() => setShowWebImagePicker(false)}
          onImagesAdded={(updatedItem, _count, newUrls) => {
            if (updatedItem?.imageUrl) {
              setImageUrl(updatedItem.imageUrl);
            } else if (newUrls && newUrls[0]) {
              setImageUrl(newUrls[0]);
            }

            const candidateImages = Array.isArray(updatedItem?.images) && updatedItem.images.length > 0
              ? updatedItem.images
              : newUrls && newUrls.length > 0
              ? newUrls
              : [];

            if (candidateImages.length > 0) {
              setExtraImages(candidateImages);
            }
            setShowWebImagePicker(false);
          }}
        />
      )}
    </div>
  );
};
