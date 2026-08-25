// ═══ Email Autocomplete / Typo Correction ═══════════════════════════
// Fixes common typos, missing TLDs, and malformed email addresses

/** Common domain typos → correct domain */
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmao.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gamil.co': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gmailc.om': 'gmail.com',
  'gmaill.co': 'gmail.com',
  'gmalil.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gmailll.com': 'gmail.com',
  
  // Yahoo
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yahoos.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yaho.co.uk': 'yahoo.co.uk',
  'yahooo.co.uk': 'yahoo.co.uk',
  'yahooo.co': 'yahoo.co.uk',
  'yhoo.com': 'yahoo.com',
  
  // Outlook / Hotmail
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlok.co': 'outlook.com',
  'outlok.net': 'outlook.com',
  'outlok.org': 'outlook.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmal.co': 'hotmail.com',
  'hotmial.co': 'hotmail.com',
  'hotmal.net': 'hotmail.com',
  'hotmil.co': 'hotmail.com',
  'hotmail.cmo': 'hotmail.com',
  
  // AOL
  'aol.co': 'aol.com',
  'aol.cm': 'aol.com',
  'ao.com': 'aol.com',
  'aolc.om': 'aol.com',
  
  // iCloud
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.cm': 'icloud.com',
  'icloudd.com': 'icloud.com',
  
  // Live
  'live.co': 'live.com',
  'live.cm': 'live.com',
  'live.con': 'live.com',
  'liva.com': 'live.com',
  
  // ProtonMail
  'protonmai.com': 'protonmail.com',
  'protonmail.co': 'protonmail.com',
  'protonmail.cm': 'protonmail.com',
  'proton.me': 'proton.me',
  'prontonmail.com': 'protonmail.com',
  'protonmail.cmo': 'protonmail.com',
  
  // Other common ones
  'rediffmail.co': 'rediffmail.com',
  'zoho.co': 'zoho.com',
  'zoho.cm': 'zoho.com',
  'mail.com': 'mail.com',
  'msn.co': 'msn.com',
  'msn.cm': 'msn.com',
  'comcast.net': 'comcast.net',
  'verizon.net': 'verizon.net',
  'att.net': 'att.net',
  'charter.net': 'charter.net',
};

/** Known valid TLDs */
const VALID_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'mil', 'int',
  'co', 'io', 'me', 'us', 'uk', 'ca', 'au', 'de', 'fr', 'jp', 'cn',
  'info', 'biz', 'name', 'pro', 'mobi', 'travel', 'museum', 'aero', 'coop', 'jobs',
  'app', 'dev', 'tech', 'online', 'site', 'website', 'store', 'shop',
  'blog', 'cloud', 'digital', 'email', 'fun', 'games', 'group', 'live', 'media',
  'news', 'page', 'pet', 'pics', 'porn', 'pro', 'racing', 'rock', 'sex', 'sexy',
  'space', 'store', 'team', 'top', 'video', 'xyz', 'zone',
  'uk', 'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'com.au', 'com.br', 'com.cn',
  'com.mx', 'com.tw', 'com.sg', 'com.hk', 'com.ar', 'com.co', 'com.tr',
  'org.uk', 'net.au', 'edu.au', 'gov.uk',
  'fr', 'de', 'it', 'es', 'nl', 'be', 'at', 'ch', 'pl', 'se', 'no', 'dk', 'fi',
  'cz', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt', 'lv', 'ee', 'ie', 'pt', 'gr',
]);

export interface AutocompleteSuggestion {
  original: string;
  corrected: string;
  type: 'typo_fix' | 'missing_tld' | 'domain_fix' | 'minor_fix';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Analyze an email address and suggest corrections for common issues.
 */
export function suggestCorrections(email: string): AutocompleteSuggestion[] {
  const suggestions: AutocompleteSuggestion[] = [];
  const trimmed = email.trim().toLowerCase();
  
  if (!trimmed || !trimmed.includes('@')) return suggestions;
  
  const [localPart, ...domainParts] = trimmed.split('@');
  const domain = domainParts.join('@'); // in case there are extra @'s
  
  if (!localPart || !domain) return suggestions;
  
  // ─── Check 1: Domain typo fix ─────────────────────────────
  const typoFix = DOMAIN_TYPOS[domain];
  if (typoFix && typoFix !== domain) {
    suggestions.push({
      original: trimmed,
      corrected: `${localPart}@${typoFix}`,
      type: 'typo_fix',
      confidence: 'high',
      reason: `"${domain}" looks like a typo for "${typoFix}"`,
    });
  }
  
  // ─── Check 2: Missing TLD (no dot in domain) ──────────────
  if (!domain.includes('.')) {
    // Check if it's a known domain without TLD
    const withCom = `${domain}.com`;
    const typoFixWithCom = DOMAIN_TYPOS[withCom];
    if (typoFixWithCom) {
      suggestions.push({
        original: trimmed,
        corrected: `${localPart}@${typoFixWithCom}`,
        type: 'typo_fix',
        confidence: 'high',
        reason: `"${domain}" → "${typoFixWithCom}" (common domain)`,
      });
    } else if (VALID_TLDS.has(domain)) {
      // Already a valid TLD-only domain (rare but possible)
    } else {
      suggestions.push({
        original: trimmed,
        corrected: `${localPart}@${domain}.com`,
        type: 'missing_tld',
        confidence: 'medium',
        reason: `"${domain}" is missing a TLD — did you mean "${domain}.com"?`,
      });
    }
  }
  
  // ─── Check 3: Domain has wrong TLD ────────────────────────
  if (domain.includes('.')) {
    const parts = domain.split('.');
    const tld = parts[parts.length - 1];
    const domainBase = parts.slice(0, -1).join('.');
    
    // Check if TLD is a common misspelling of a real TLD
    const tldCorrections: Record<string, string> = {
      'con': 'com',
      'cmo': 'com',
      'cim': 'com',
      'coom': 'com',
      'comm': 'com',
      'om': 'com',
      'ccom': 'com',
      'cok': 'com',
      'cor': 'com',
      'cot': 'com',
      'cog': 'com',
      'cfo': 'com',
      'nnet': 'net',
      'new': 'net',
      'ney': 'net',
      'nett': 'net',
      'nr': 'net',
      'neet': 'net',
      'ogr': 'org',
      'orgg': 'org',
      'or': 'org',
      'og': 'org',
      'eduu': 'edu',
      'eduucation': 'edu',
      'gouv': 'gov',
    };
    
    const correctedTld = tldCorrections[tld];
    if (correctedTld) {
      suggestions.push({
        original: trimmed,
        corrected: `${localPart}@${domainBase}.${correctedTld}`,
        type: 'domain_fix',
        confidence: 'high',
        reason: `"${tld}" should be "${correctedTld}"`,
      });
    }
  }
  
  // ─── Check 4: Double dots ─────────────────────────────────
  if (domain.includes('..')) {
    const fixedDomain = domain.replace(/\.\./g, '.');
    suggestions.push({
      original: trimmed,
      corrected: `${localPart}@${fixedDomain}`,
      type: 'minor_fix',
      confidence: 'high',
      reason: `Double dots in domain`,
    });
  }
  
  // ─── Check 5: Local part issues ───────────────────────────
  if (localPart.includes('..')) {
    const fixedLocal = localPart.replace(/\.\./g, '.');
    suggestions.push({
      original: trimmed,
      corrected: `${fixedLocal}@${domain}`,
      type: 'minor_fix',
      confidence: 'high',
      reason: `Double dots in local part`,
    });
  }
  
  // ─── Check 6: Extra characters before @ ───────────────────
  // Common: "name @domain.com" (space before @)
  if (localPart !== localPart.trim()) {
    suggestions.push({
      original: trimmed,
      corrected: `${localPart.trim()}@${domain}`,
      type: 'minor_fix',
      confidence: 'high',
      reason: `Extra spaces around local part`,
    });
  }
  
  // ─── Check 7: Domain looks like it has extra characters ────
  // e.g., "user@gamil.com" is already caught by typo fix, but also:
  if (domain.match(/[0-9]{5,}/)) {
    // Long number sequences in domain are suspicious
    // but not necessarily wrong (e.g., some corporate domains)
  }
  
  // ─── Check 8: Common prefix/suffix mistakes ───────────────
  // "user@-domain.com" or "user@.domain.com"
  if (domain.startsWith('-') || domain.startsWith('.')) {
    suggestions.push({
      original: trimmed,
      corrected: `${localPart}@${domain.replace(/^[-.]+/, '')}`,
      type: 'minor_fix',
      confidence: 'medium',
      reason: `Domain starts with invalid character`,
    });
  }
  
  // ─── Check 9: Trailing junk after valid TLD ──────────────────
  // e.g. "eragon@hotmail.com10" → "eragon@hotmail.com"
  //       "user@gmail.comabc" → "user@gmail.com"
  {
    const knownTlds = ['com','net','org','edu','gov','mil','co','io','me','us','uk','ca','au','de','fr','jp','info','biz','app','dev','tech','online','site','store','blog','cloud','group','live','media','news','xyz'];
    for (const tld of knownTlds) {
      const tldIdx = domain.indexOf('.' + tld);
      if (tldIdx > 0) {
        const afterTld = domain.substring(tldIdx + tld.length + 1);
        // Check if there's nothing after TLD (normal case), or there's junk after TLD
        if (afterTld.length > 0 && /[a-z0-9]/i.test(afterTld)) {
          const baseDomain = domain.substring(0, tldIdx + tld.length + 1).replace(/\.$/, '');
          const trailingNums = afterTld.match(/^(\d+)$/);
          if (trailingNums) {
            suggestions.push({
              original: trimmed,
              corrected: `${localPart}@${baseDomain}`,
              type: 'minor_fix',
              confidence: 'high',
              reason: `Trailing "${afterTld}" after domain — removed`,
            });
          } else if (afterTld.length <= 10) {
            suggestions.push({
              original: trimmed,
              corrected: `${localPart}@${baseDomain}`,
              type: 'minor_fix',
              confidence: 'medium',
              reason: `Extra "${afterTld}" after domain — removed`,
            });
          }
        }
        break; // Only match the first TLD found
      }
    }
  }

  // ─── Check 10: Numbers appended to local part ─────────────────
  // e.g. "john1234567890@gmail.com" — flag as suspicious
  if (localPart.match(/^[a-z]+\d{6,}$/i)) {
    // 6+ digits appended to name — possible data artifact
    // Don't auto-fix, but could flag
  }

  // ─── Check 11: Leading/trailing whitespace in full email ──────
  if (email !== trimmed) {
    suggestions.push({
      original: email,
      corrected: trimmed,
      type: 'minor_fix',
      confidence: 'high',
      reason: `Leading/trailing whitespace removed`,
    });
  }

  // Deduplicate suggestions by corrected value
  const seen = new Set<string>();
  return suggestions.filter(s => {
    if (seen.has(s.corrected)) return false;
    seen.add(s.corrected);
    return true;
  });
}

/**
 * Batch analyze multiple emails and return all suggestions.
 */
export function batchSuggestCorrections(emails: string[]): {
  suggestions: AutocompleteSuggestion[];
  summary: {
    total: number;
    fixable: number;
    byType: Record<string, number>;
  };
} {
  const allSuggestions: AutocompleteSuggestion[] = [];
  const byType: Record<string, number> = {};
  
  for (const email of emails) {
    const fixes = suggestCorrections(email);
    allSuggestions.push(...fixes);
    for (const fix of fixes) {
      byType[fix.type] = (byType[fix.type] || 0) + 1;
    }
  }
  
  return {
    suggestions: allSuggestions,
    summary: {
      total: emails.length,
      fixable: new Set(allSuggestions.map(s => s.original)).size,
      byType,
    },
  };
}