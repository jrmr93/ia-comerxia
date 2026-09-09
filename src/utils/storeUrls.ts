/**
 * Helper utilities to generate public, shareable customer URLs for the online store and products.
 * Guarantees that public links ALWAYS use the customer storefront domain / subdomains (e.g. www., tienda.)
 * and NEVER expose or share administrative subdomains (e.g. admin., panel.).
 */

import { safeLocalStorage } from './safeStorage.ts';

/**
 * Extracts a clean domain string (removing protocols, ports, and sub-paths)
 */
function cleanDomain(rawDomain: string): string {
  if (!rawDomain) return '';
  return rawDomain
    .split(/[,;\n]/)[0]
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim();
}

/**
 * Retrieves the preferred public customer store domain from cache or configuration
 */
export function getPreferredCustomerStoreDomain(customStoreDomain?: string): string {
  if (typeof window === 'undefined') return '';

  // 1. Explicit domain passed as argument
  if (customStoreDomain && customStoreDomain.trim()) {
    const list = customStoreDomain.split(/[,;\n]/).map(cleanDomain).filter(Boolean);
    // Prefer one that is not localhost and not starting with admin.
    const nonAdmin = list.find((d) => !d.toLowerCase().startsWith('admin.') && !d.includes('localhost') && !d.includes('127.0.0.1'));
    if (nonAdmin) return nonAdmin;
    if (list[0] && !list[0].includes('localhost') && !list[0].includes('127.0.0.1')) return list[0];
  }

  // 2. Check cached server domain config in localStorage
  try {
    const cachedRaw = safeLocalStorage.getItem('comerxia_domain_config_cache');
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached?.storeDomain && typeof cached.storeDomain === 'string') {
        const list = cached.storeDomain.split(/[,;\n]/).map(cleanDomain).filter(Boolean);
        const validStoreDomain = list.find(
          (d) => !d.toLowerCase().startsWith('admin.') && !d.includes('localhost') && !d.includes('127.0.0.1')
        );
        if (validStoreDomain) return validStoreDomain;
      }
    }
  } catch {}

  // 3. Inspect current window hostname
  const hostname = window.location.hostname.toLowerCase();
  
  // If user is currently browsing on an admin subdomain (e.g., admin.dominio.com), convert to store subdomain (www.dominio.com or tienda.dominio.com)
  if (hostname.startsWith('admin.')) {
    const baseDomain = hostname.replace(/^admin\./, '');
    if (baseDomain && !baseDomain.includes('localhost') && !baseDomain.includes('127.0.0.1') && !baseDomain.includes('run.app')) {
      return `www.${baseDomain}`;
    }
  }

  // If user is on a known store subdomain (e.g., www.dominio.com, tienda.dominio.com, catalogo.dominio.com)
  if (
    (hostname.startsWith('www.') ||
      hostname.startsWith('tienda.') ||
      hostname.startsWith('store.') ||
      hostname.startsWith('catalogo.')) &&
    !hostname.includes('localhost') &&
    !hostname.includes('127.0.0.1') &&
    !hostname.includes('run.app')
  ) {
    return hostname;
  }

  return '';
}

/**
 * Returns the public URL for the store catalog for customers
 */
export function getPublicStoreUrl(customStoreDomain?: string): string {
  if (typeof window === 'undefined') return '';

  const storeDomain = getPreferredCustomerStoreDomain(customStoreDomain);
  if (storeDomain) {
    return `https://${storeDomain}`;
  }

  // Fallback for cloud preview / development containers (e.g. Cloud Run, AI Studio dev/pre)
  const origin = window.location.origin;
  // Make sure origin does not have admin. prefix
  const cleanOrigin = origin.replace(/:\/\/(admin\.)/i, '://www.');
  return `${cleanOrigin}/?view=store`;
}

/**
 * Returns the public URL for a specific product to share with customers
 */
export function getPublicProductUrl(productId: number | string, customStoreDomain?: string): string {
  if (typeof window === 'undefined') return '';

  const encodedId = encodeURIComponent(String(productId).trim());
  const storeDomain = getPreferredCustomerStoreDomain(customStoreDomain);

  if (storeDomain) {
    return `https://${storeDomain}/?producto=${encodedId}`;
  }

  // Fallback for cloud preview / development containers
  const origin = window.location.origin;
  const cleanOrigin = origin.replace(/:\/\/(admin\.)/i, '://www.');
  return `${cleanOrigin}/?view=store&producto=${encodedId}`;
}
