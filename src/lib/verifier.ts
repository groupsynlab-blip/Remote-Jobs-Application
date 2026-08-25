import dns from 'dns';
import net from 'net';
import { getDb } from './db';
import type { VerificationMode, VerificationJob } from './types';

// ═══ Disposable Domains (top ~1500) ═══════════════════════════════════

const DISPOSABLE_DOMAINS = new Set([
  '0-mail.com','0815.ru','0clickemail.com','0wnd.net','0wnd.org',
  '10minutemail.co.za','10minutemail.com','123-m.com','1chuan.com','1pad.de',
  '1zhuan.com','20minutemail.com','21cn.com','2prong.com','30minutemail.com',
  '33mail.com','3d-painting.com','4warding.com','4warding.net','4warding.org',
  '5ghgfhfghfgh.tk','60minutemail.com','675hosting.com','675hosting.net',
  '675hosting.org','6url.com','75hosting.com','7tags.com','9ox.net',
  'a-bc.net','afrobacon.com','agedmail.com','ajaxapp.net','alivance.com',
  'amilegit.com','amiri.net','anappthat.com','ano-mail.net','anonbox.net',
  'anonymbox.com','antichef.com','antichef.net','antireg.ru','antispam.de',
  'antispammail.de','armyspy.com','artman-conception.com','azmeil.tk',
  'baxomale.ht.cx','beefmilk.com','bigstring.com','binkmail.com','bio-muesli.net',
  'bladesmail.net','bloatbox.com','bobmail.info','bodhi.lawlita.com','bofthew.com',
  'bootybay.de','boun.cr','bouncr.com','breakthru.com','brefmail.com',
  'brennendesreich.de','broadbandninja.com','bsnow.net','bspamfree.org',
  'buffemail.com','bugmenot.com','bumpymail.com','bundes-ede.de','buxap.com',
  'buymoreplays.com','buyusedlibrarybooks.org','byebyemail.com',
  'c2.hu','cachedot.net','casualdx.com','cellurl.com','centermail.com',
  'centermail.net','chammy.info','cheatmail.de','chogmail.com','choicemail1.com',
  'clixser.com','cmail.net','cmail.org','coldemail.info','cool.fr.nf',
  'correo.blogos.net','cosmorph.com','courriel.fr.nf','courrieltemporaire.com',
  'crapmail.org','crazymailing.com','cubiclink.com','curryworld.de',
  'cust.in','cuvox.de','d3p.dk','dacoolest.com','dandikmail.com',
  'dayrep.com','dcemail.com','deadaddress.com','deadspam.com','delikkt.de',
  'despam.it','despammed.com','devnullmail.com','dfgh.net','digitalsanctuary.com',
  'dingbone.com','discusfish.com','disposable.cf','disposable.ga',
  'disposable.ml','disposable.tk','disposableaddress.com',
  'disposableemailaddresses.emailmiser.com','disposableinbox.com',
  'dispose.it','disposeamail.com','disposemail.com','dispostable.com',
  'dm.w3internet.co.uk','dodgeit.com','dodgit.com','dodgit.org',
  'dontreg.com','dontsendmespam.de','drdrb.com','drdrb.net','droplar.com',
  'dropmail.me','duam.net','dudmail.com','dump-email.info','dumpandjunk.com',
  'dumpmail.de','dumpyemail.com','e-mail.com','e-mail.org','e4ward.com',
  'easytrashmail.com','ee1.pl','ee2.pl','eelmail.com','einrot.com',
  'einrot.de','eintagsmail.de','email-fake.cf','email-fake.com',
  'email-fake.ga','email-fake.gq','email-fake.ml','email-fake.tk',
  'email60.com','emailage.cf','emailage.ga','emailage.gq','emailage.ml',
  'emailage.tk','emaildienst.de','emailgo.de','emailias.com','emailigo.de',
  'emailinfive.com','emaillime.com','emailmiser.com','emailproxsy.com',
  'emailresort.com','emails.ga','emailsensei.com','emailsingularity.net',
  'emailspam.cf','emailspam.ga','emailspam.gq','emailspam.ml','emailspam.tk',
  'emailtemporanea.com','emailtemporanea.net','emailtemporar.ro',
  'emailtemporario.com.br','emailthe.net','emailtmp.com','emailto.de',
  'emailwarden.com','emailx.at.hm','emailxfer.com','emeil.in','emeil.ir',
  'emz.net','enterto.com','ephemail.net','etranquil.com','etranquil.net',
  'etranquil.org','evopo.com','explodemail.com','express.net.ua',
  'eyepaste.com','fakeinbox.com','fakeinformation.com','fakemail.fr',
  'fakemailz.com','fammix.com','fansworldwide.de','fantasymail.de',
  'fastacura.com','fastchevy.com','fastchrysler.com','fastkawasaki.com',
  'fastmazda.com','fastmitsubishi.com','fastnissan.com','fastsubaru.com',
  'fastsuzuki.com','fasttoyota.com','fastyamaha.com','fightallspam.com',
  'filzmail.com','fixmail.tk','fizmail.com','fizmail.eu','fleckens.hu',
  'flyspam.com','footard.com','forgetmail.com','fr33mail.info',
  'frapmail.com','freundin.ru','friendlymail.co.uk','front14.org',
  'fuckingduh.com','fudgerub.com','fux0ringduh.com','fyii.de',
  'garliclife.com','gehensiull.com','gerontrix.com','getsimpleemail.com',
  'glucosegrin.com','gorillaswithdirtyarmpits.com','gotmail.com',
  'gotmail.net','gotmail.org','gowikibooks.com','gowikicampus.com',
  'gowikicars.com','gowikifilms.com','gowikigames.com','gowikimusic.com',
  'gowikinetwork.com','gowikitravel.com','gowikitv.com','grandmamail.com',
  'grandmasmail.com','great-host.in','greensloth.com','greermail.com',
  'greystar.cloud','gsch.de','guerillamail.biz','guerillamail.com',
  'guerillamail.de','guerillamail.info','guerillamail.net','guerillamail.org',
  'guerrillamail.biz','guerrillamail.com','guerrillamail.de',
  'guerrillamail.info','guerrillamail.net','guerrillamail.org',
  'guerrillamailblock.com','gustr.com','h8s.org','hacccc.com',
  'haltospam.com','harakirimail.com','hartbot.de','hat-gansen.de',
  'hatikva-email.com','hatikva.info','hatikva.net','hatikva.org',
  'hatespam.org','herp.in','hidemail.de','hidzz.com','hmamail.com',
  'hopemail.biz','hot-mail.cf','hot-mail.ga','hot-mail.gq','hot-mail.ml',
  'hot-mail.tk','hotpop.com','hulapla.de','hushmail.com',
  'ichimail.com','imails.info','inbax.tk','inbox.si','inbox.me',
  'inbox.net','inbox.ru','inboxclean.com','inboxclean.org','inboxproxy.com',
  'incognitomail.com','incognitomail.net','incognitomail.org',
  'ineec.net','infocom.zp.ua','inoutmail.de','inoutmail.info',
  'inoutmail.net','inoutmail.org','insorg-mail.info','ipoo.org',
  'irish2me.com','iwi.net','jetable.com','jetable.fr.nf','jetable.net',
  'jetable.org','jnxjn.com','jourrapide.com','jsrsolutions.com',
  'junk1e.com','junkmail.ga','junkmail.gq','junkmail.pro',
  'kasmail.com','kaspop.com','keepmymail.com','killmail.com',
  'killmail.net','kir.ch.tc','klassmaster.com','klassmaster.net',
  'klzlk.com','kook.ml','kostenlose-mailadresse.de','krimoton.com',
  'kuhremail.de','lackmail.ru','lags.us','lawlita.com','letthemeatspam.com',
  'lhsdv.com','lifebyfood.com','link2mail.net','litedrop.com',
  'lol.ovpn.to','lookugly.com','lopl.co.cc','lortemail.dk',
  'lovemeleaveme.com','lr78.com','lroid.com','lukop.dk','m21.cc',
  'maboard.com','mail-temporaire.fr','mail.by','mail.mezimages.net',
  'mail.zp.ua','mail114.net','mail1a.de','mail1st.com','mail21.cc',
  'mail2rss.org','mail333.com','mail4trash.com','mailbidon.com',
  'mailblocks.com','mailblog.biz','mailbucket.org','mailcat.biz',
  'mailcatch.com','maildrop.cc','maildrop.cf','maildrop.ga','maildrop.gq',
  'maildu.de','maildx.com','maileater.com','mailed.ro','maileimer.de',
  'mailexpire.com','mailfa.tk','mailforspam.com','mailfree.ga',
  'mailfree.gq','mailfree.ml','mailfreeonline.com','mailfs.com',
  'mailguard.me','mailhazard.com','mailhz.me','mailimate.com',
  'mailin8r.com','mailinater.com','mailinator.com','mailinator.net',
  'mailinator.org','mailinator.us','mailinator2.com','mailincubator.com',
  'mailismag.com','mailmoat.com','mailnator.com','mailnesia.com',
  'mailnull.com','mailorg.org','mailpick.info','mailproxsy.com',
  'mailquack.com','mailrock.biz','mailscrap.com','mailshell.com',
  'mailsiphon.com','mailslite.com','mailtemp.info','mailtome.de',
  'mailtothis.com','mailtrash.net','mailtv.net','mailtv.tv',
  'mailwith.me','mailwork.org','mailzer.org','makemetheking.com',
  'manifestgenerator.com','manybrain.com','mbx.cc','mega.zik.dj',
  'meinschiff.org','meistermail.com','meltmail.com','messagebeamer.de',
  'mezimages.net','mfsa.ru','mierdamail.com','migmail.pl','migumail.com',
  'mindless.com','missionmode.com','mittalindia.com','mobi.web.id',
  'mohmal.com','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  'monumentmail.com','msa.minsmail.com','mt2015.com','mx0.wwwnew.eu',
  'my10minutemail.com','myalias.pw','mycard.net.ua','mycleaninbox.net',
  'myemailboxy.com','mymail-in.net','mymailoasis.com','mymailuk.net',
  'myownemail.com','mytemp.email','mytempemail.com','mytempmail.com',
  'mythrowaway.email','mytempmail.com','nabala.com','neomailbox.com',
  'nepwk.com','nervmich.net','nervtansen.de','netmails.com',
  'netmails.net','netzidiot.de','nice-4u.com','nincsmail.hu',
  'nnh.com','no-spam.ws','nobulk.com','noclickemail.com',
  'nogmailspam.info','nomail.xl.cx','nomail2me.com','nomorespamemails.com',
  'nonspam.eu','nonspammer.de','noref.in','nospam.ze.tc','nospam4.us',
  'nospamfor.us','nospammail.net','nospamthanks.info','nothingtoseehere.ca',
  'nowmymail.com','nurfuerspam.de','nus.edu.sg','nwldx.com',
  'objectmail.com','obobbo.com','odnorazovoe.ru','oneoffemail.com',
  'onewaymail.com','oopi.org','ordinaryamerican.net','otherinbox.com',
  'ourklips.com','outlawspam.com','ovpn.to','owlpic.com',
  'pancakemail.com','pimpedupmyspace.com','pjjkp.com','plexolan.de',
  'poczta.onet.pl','politikerclub.de','poofy.org','pookmail.com',
  'privacy.net','privatdemail.net','proxymail.eu','prtnx.com',
  'punkass.com','putthisinyouremail.com','qq.com','quickinbox.com',
  'quickmail.nl','rcpt.at','reallymymail.com','realtyalerts.ca',
  'recode.me','recursor.net','regbypass.com','regbypass.comsafe-mail.net',
  'rejectmail.com','reliable-mail.com','rhyta.com','rklips.com',
  'rmqkr.net','royal.net','rppkn.com','rtrtr.com','s0ny.net',
  'safe-mail.net','safersignup.com','safetymail.info','safetypost.de',
  'sandelf.de','saynotospams.com','scatmail.com','schafmail.de',
  'schrott-email.de','secretemail.de','secure-mail.biz','selfdestructingmail.org',
  'sendspamhere.com','shiftmail.com','shitmail.me','shitmail.org',
  'shitware.nl','shmeriously.com','shortmail.net','sibmail.com',
  'sinnlos-mail.de','skeefmail.com','slaskpost.se','slipry.net',
  'slopsbox.com','slowslow.de','slutty.horse','smashmail.de',
  'smellfear.com','snakemail.com','sneakemail.com','sneakymail.de',
  'snkmail.com','sofimail.com','sofort-mail.de','softpls.asia',
  'sogetthis.com','soodonims.com','spam.la','spam.su','spam4.me',
  'spamavert.com','spambob.com','spambob.net','spambob.org',
  'spambog.com','spambog.de','spambog.ru','spambot.de','spambox.info',
  'spambox.irishspringrealty.com','spambox.us','spamcannon.com',
  'spamcannon.net','spamcero.com','spamcorptastic.com','spamcowboy.com',
  'spamcowboy.net','spamcowboy.org','spamday.com','spamex.com',
  'spamfighter.cf','spamfighter.ga','spamfighter.gq','spamfighter.ml',
  'spamfighter.tk','spamfree.eu','spamfree24.com','spamfree24.de',
  'spamfree24.eu','spamfree24.info','spamfree24.net','spamfree24.org',
  'spamgoes.in','spamgourmet.com','spamgourmet.net','spamgourmet.org',
  'spamherelots.com','spamhereplease.com','spamhole.com','spamify.com',
  'spaminator.de','spamkill.info','spaml.com','spaml.de','spammotel.com',
  'spamobox.com','spamoff.de','spamslicer.com','spamspot.com',
  'spamstack.net','spamthis.co.uk','spamthisplease.com','spamtrail.com',
  'spamtrap.ro','speed.1s.fr','superrito.com','superstachel.de',
  'suremail.info','svk.jp','sweetxxx.de','tafmail.com','talkinator.com',
  'tapchicuoihoi.com','teleworm.com','teleworm.us','temp-mail.org',
  'temp-mail.ru','tempalias.com','tempe6.com','tempemail.biz',
  'tempemail.co.za','tempemail.com','tempemail.net','tempinbox.co.uk',
  'tempinbox.com','tempmail.eu','tempmail.it','tempmail2.com',
  'tempmaildemo.com','tempmailer.com','tempmailer.de','tempomail.fr',
  'temporarily.de','temporarioemail.com.br','temporaryemail.net',
  'temporaryemail.us','temporaryforwarding.com','temporaryinbox.com',
  'temporarymailaddress.com','tempthe.net','tempthe.net','thankyou2010.com',
  'thc.st','thecloudindex.com','thetempmail.com','throwawayemailaddress.com',
  'tittbit.in','tizi.com','tmailinator.com','toiea.com','toomail.biz',
  'topranklist.de','tradermail.info','trash-amil.com','trash-me.com',
  'trash2009.com','trashdevil.com','trashdevil.de','trashemail.de',
  'trashmail.at','trashmail.com','trashmail.de','trashmail.me',
  'trashmail.net','trashmail.org','trashmail.ws','trashmailer.com',
  'trashymail.com','trashymail.net','trillianpro.com','turual.com',
  'twinmail.de','tyldd.com','uggsrock.com','umail.net',
  'upliftnow.com','uplipht.com','venompen.com','veryreallymail.com',
  'viditag.com','viewcastmedia.net','viewcastmedia.org','vomoto.com',
  'vpn.st','vsimcard.com','vubby.com','wasteland.rfc822.org',
  'webemail.me','weg-werf-email.de','wegwerfadresse.de',
  'wegwerfemail.com','wegwerfemail.de','wegwerfemail.net',
  'wegwerfemail.org','wegwerfmail.de','wegwerfmail.net',
  'wegwerfmail.org','wetrainbayarea.com','wetrainbayarea.org',
  'wh4f.org','whatiaas.com','whatpaas.com','whyspam.me',
  'wickmail.net','widot.com','winemaven.info','wronghead.com',
  'wuzup.net','wuzupmail.net','wwwnew.eu','xagloo.com','xemaps.com',
  'xents.com','xjoi.com','xmaily.com','xoxy.net','yapped.net',
  'yeah.net','yep.it','yogamaven.com','yomail.info','yomail.tld',
  'yopmail.com','yopmail.fr','yopmail.gq','you-spam.com','ypmail.webarnak.fr.eu.org',
  'yuurok.com','zehnminutenmail.de','zippymail.info','zoaxe.com',
  'zoemail.org','guerrillamail.com','guerrillamail.de','dispostable.com',
]);

// ═══ Role Accounts ═══════════════════════════════════════════════════

const ROLE_ACCOUNTS = new Set([
  'abuse','admin','administrator','billing','compliance','devnull',
  'dns','ftp','hostmaster','info','inoc','ispfeedback','ispsupport',
  'jobs','list','listmaster','maildaemon','mailerdaemon','marketing',
  'news','noc','noreply','null','office','operations','postmaster',
  'privacy','registrar','remove','request','role','root','sales',
  'security','service','spam','subscribe','support','sysadmin',
  'tech','undisclosed-recipients','unsubscribe','usenet','uucp',
  'webmaster','www',
]);

// ═══ Syntax Validation ══════════════════════════════════════════════

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 253;

export function checkSyntax(email: string): boolean {
  if (!email || email.length > 255) return false;
  
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex >= email.length - 1) return false;
  
  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex + 1);
  
  if (local.length === 0 || local.length > MAX_LOCAL_LENGTH) return false;
  if (domain.length === 0 || domain.length > MAX_DOMAIN_LENGTH) return false;
  if (!EMAIL_REGEX.test(email)) return false;
  
  // Domain must have at least one dot
  if (!domain.includes('.')) return false;
  
  // TLD must be at least 2 chars
  const tld = domain.split('.').pop() || '';
  if (tld.length < 2) return false;
  
  return true;
}

export function extractDomain(email: string): string | null {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return null;
  return email.substring(atIndex + 1).toLowerCase();
}

export function extractLocalPart(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0) return email;
  return email.substring(0, atIndex).toLowerCase();
}

// ═══ Disposable & Role Checks ═══════════════════════════════════════

export function isDisposable(email: string): boolean {
  const domain = extractDomain(email);
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

export function isRoleAccount(email: string): boolean {
  const local = extractLocalPart(email);
  return ROLE_ACCOUNTS.has(local);
}

// ═══ DNS MX Lookup ═══════════════════════════════════════════════════

export interface MxResult {
  valid: boolean;
  records: string[];
  error?: string;
}

const mxCache = new Map<string, MxResult>();

export function resolveMx(domain: string): Promise<MxResult> {
  const cached = mxCache.get(domain);
  if (cached) return Promise.resolve(cached);
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      const result: MxResult = { valid: false, records: [], error: 'DNS timeout' };
      mxCache.set(domain, result);
      resolve(result);
    }, 10000);
    
    dns.resolveMx(domain, (err, addresses) => {
      clearTimeout(timeout);
      if (err || !addresses || addresses.length === 0) {
        const result: MxResult = { valid: false, records: [], error: err?.message || 'No MX records' };
        mxCache.set(domain, result);
        resolve(result);
      } else {
        const sorted = addresses.sort((a, b) => a.priority - b.priority);
        const records = sorted.map(a => a.exchange);
        const result: MxResult = { valid: true, records };
        mxCache.set(domain, result);
        resolve(result);
      }
    });
  });
}

// ═══ SMTP Verification ══════════════════════════════════════════════

interface SmtpResult {
  valid: boolean;
  catchAll: boolean | null;
  error?: string;
}

function smtpQuery(mxHost: string, email: string, fromAddress: string, timeoutMs: number): Promise<SmtpResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let buffer = '';
    let resolved = false;
    let step = 0;
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try { socket.destroy(); } catch {}
      }
    };
    
    const finish = (result: SmtpResult) => {
      cleanup();
      resolve(result);
    };
    
    const timer = setTimeout(() => {
      finish({ valid: false, catchAll: null, error: 'SMTP timeout' });
    }, timeoutMs);
    
    socket.on('error', (err) => {
      clearTimeout(timer);
      finish({ valid: false, catchAll: null, error: err.message });
    });
    
    socket.on('close', () => {
      clearTimeout(timer);
      if (!resolved) {
        finish({ valid: false, catchAll: null, error: 'Connection closed unexpectedly' });
      }
    });
    
    socket.on('data', (data) => {
      buffer += data.toString();
      
      // Process line by line
      if (!buffer.includes('\n')) return;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r/g, '').trim();
        if (!line) continue;
        
        const code = parseInt(line.substring(0, 3), 10);
        
        if (step === 0 && code === 220) {
          // Server ready, send EHLO
          step = 1;
          socket.write(`EHLO verify.local\r\n`);
        } else if (step === 1 && (code === 250 || code === 220)) {
          // Check if we got all 250 responses (multi-line ends with 250-)
          if (line.startsWith('250-')) continue; // multi-line, wait for final 250
          step = 2;
          socket.write(`MAIL FROM:<${fromAddress}>\r\n`);
        } else if (step === 2 && code === 250) {
          step = 3;
          socket.write(`RCPT TO:<${email}>\r\n`);
        } else if (step === 3) {
          // RCPT TO response
          clearTimeout(timer);
          if (code === 250 || code === 251) {
            finish({ valid: true, catchAll: null });
          } else {
            finish({ valid: false, catchAll: null, error: line });
          }
          try { socket.write('QUIT\r\n'); } catch {}
          cleanup();
          return;
        } else if (code >= 500 || code === 421) {
          clearTimeout(timer);
          finish({ valid: false, catchAll: null, error: line });
          cleanup();
          return;
        }
      }
    });
  });
}

/**
 * Check if a domain is catch-all by trying a random address
 */
async function checkCatchAll(mxHost: string, domain: string, timeoutMs: number): Promise<boolean | null> {
  const randomLocal = `test-${Math.random().toString(36).substring(2, 12)}`;
  const fakeEmail = `${randomLocal}@${domain}`;
  const result = await smtpQuery(mxHost, fakeEmail, `verify@${domain}`, timeoutMs);
  return result.valid; // If valid for a random address, it's catch-all
}

// ═══ Single Email Verification ══════════════════════════════════════

interface VerifyOptions {
  mode: VerificationMode;
  smtpTimeoutMs?: number;
  catchAllDetection?: boolean;
}

export interface SingleResult {
  email: string;
  syntaxValid: boolean;
  mxValid: boolean;
  smtpValid: boolean | null;
  isDisposable: boolean;
  isRoleAccount: boolean;
  isCatchAll: boolean | null;
  status: 'valid' | 'invalid' | 'risky' | 'error';
  errorMessage: string | null;
}

export async function verifySingleEmail(
  email: string,
  options: VerifyOptions
): Promise<SingleResult> {
  const smtpTimeout = options.smtpTimeoutMs || 10000;
  
  // 1. Syntax check
  const syntaxValid = checkSyntax(email);
  if (!syntaxValid) {
    return {
      email,
      syntaxValid: false,
      mxValid: false,
      smtpValid: null,
      isDisposable: false,
      isRoleAccount: false,
      isCatchAll: null,
      status: 'invalid',
      errorMessage: 'Invalid email syntax',
    };
  }
  
  const domain = extractDomain(email)!;
  
  // 2. Disposable check
  const disposable = isDisposable(email);
  
  // 3. Role account check
  const role = isRoleAccount(email);
  
  // 4. MX check
  const mx = await resolveMx(domain);
  if (!mx.valid) {
    return {
      email,
      syntaxValid: true,
      mxValid: false,
      smtpValid: null,
      isDisposable: disposable,
      isRoleAccount: role,
      isCatchAll: null,
      status: 'invalid',
      errorMessage: mx.error || 'No MX records',
    };
  }
  
  // Quick mode: skip SMTP
  if (options.mode === 'quick') {
    if (disposable || role) {
      return {
        email,
        syntaxValid: true,
        mxValid: true,
        smtpValid: null,
        isDisposable: disposable,
        isRoleAccount: role,
        isCatchAll: null,
        status: 'risky',
        errorMessage: disposable ? 'Disposable email' : 'Role account',
      };
    }
    return {
      email,
      syntaxValid: true,
      mxValid: true,
      smtpValid: null,
      isDisposable: false,
      isRoleAccount: false,
      isCatchAll: null,
      status: 'valid',
      errorMessage: null,
    };
  }
  
  // Thorough mode: SMTP verification
  const primaryMx = mx.records[0];
  
  // 5. Catch-all detection
  let catchAll: boolean | null = null;
  if (options.catchAllDetection !== false) {
    catchAll = await checkCatchAll(primaryMx, domain, smtpTimeout);
  }
  
  // 6. SMTP mailbox verification
  const smtpResult = await smtpQuery(primaryMx, email, `verify@${domain}`, smtpTimeout);
  
  if (catchAll) {
    return {
      email,
      syntaxValid: true,
      mxValid: true,
      smtpValid: smtpResult.valid,
      isDisposable: disposable,
      isRoleAccount: role,
      isCatchAll: true,
      status: 'risky',
      errorMessage: 'Catch-all domain',
    };
  }
  
  if (!smtpResult.valid) {
    return {
      email,
      syntaxValid: true,
      mxValid: true,
      smtpValid: false,
      isDisposable: disposable,
      isRoleAccount: role,
      isCatchAll: false,
      status: 'invalid',
      errorMessage: smtpResult.error || 'Mailbox not found',
    };
  }
  
  if (disposable || role) {
    return {
      email,
      syntaxValid: true,
      mxValid: true,
      smtpValid: true,
      isDisposable: disposable,
      isRoleAccount: role,
      isCatchAll: false,
      status: 'risky',
      errorMessage: disposable ? 'Disposable email' : 'Role account',
    };
  }
  
  return {
    email,
    syntaxValid: true,
    mxValid: true,
    smtpValid: true,
    isDisposable: false,
    isRoleAccount: false,
    isCatchAll: false,
    status: 'valid',
    errorMessage: null,
  };
}

// ═══ Background Job Processing ══════════════════════════════════════

const activeJobs = new Map<string, boolean>(); // jobId -> running flag

export function isJobActive(jobId: string): boolean {
  return activeJobs.get(jobId) === true;
}

export function cancelJob(jobId: string): void {
  activeJobs.set(jobId, false);
}

/**
 * Process a verification job in the background.
 * Processes emails in batches with configurable concurrency.
 */
export async function processVerificationJob(jobId: string): Promise<void> {
  const db = getDb();
  
  const job = db.prepare('SELECT * FROM verification_jobs WHERE id = ?').get(jobId) as VerificationJob | undefined;
  if (!job) throw new Error('Job not found');
  
  activeJobs.set(jobId, true);
  
  const mode = job.mode as VerificationMode;
  const concurrency = mode === 'thorough' ? 20 : 30;
  const smtpTimeout = 10000;
  
  // Mark as running
  db.prepare("UPDATE verification_jobs SET status = 'running' WHERE id = ?").run(jobId);
  
  console.log(`[Verifier] Starting job ${jobId.slice(0, 8)}... (mode: ${mode}, concurrency: ${concurrency})`);
  
  // Get all pending emails
  const pendingResults = db.prepare(
    "SELECT id, email FROM verification_results WHERE job_id = ? AND status = 'pending' ORDER BY id ASC"
  ).all(jobId) as { id: number; email: string }[];
  
  const totalPending = pendingResults.length;
  let processedCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  let riskyCount = 0;
  
  // Process in batches
  for (let i = 0; i < totalPending; i += concurrency) {
    // Check if cancelled
    if (!activeJobs.get(jobId)) {
      console.log(`[Verifier] Job ${jobId.slice(0, 8)}... cancelled`);
      db.prepare("UPDATE verification_jobs SET status = 'cancelled' WHERE id = ?").run(jobId);
      activeJobs.delete(jobId);
      return;
    }
    
    const batch = pendingResults.slice(i, i + concurrency);
    
    const promises = batch.map(async (row) => {
      try {
        const result = await verifySingleEmail(row.email.toLowerCase().trim(), {
          mode,
          smtpTimeoutMs: smtpTimeout,
          catchAllDetection: mode === 'thorough',
        });
        
        db.prepare(`
          UPDATE verification_results SET
            status = ?,
            syntax_valid = ?,
            mx_valid = ?,
            smtp_valid = ?,
            is_disposable = ?,
            is_role_account = ?,
            is_catch_all = ?,
            error_message = ?
          WHERE id = ?
        `).run(
          result.status,
          result.syntaxValid ? 1 : 0,
          result.mxValid ? 1 : 0,
          result.smtpValid === null ? null : (result.smtpValid ? 1 : 0),
          result.isDisposable ? 1 : 0,
          result.isRoleAccount ? 1 : 0,
          result.isCatchAll === null ? null : (result.isCatchAll ? 1 : 0),
          result.errorMessage,
          row.id
        );
        
        // Update counters
        db.prepare(`
          UPDATE verification_jobs SET processed_count = processed_count + 1,
            valid_count = valid_count + ?,
            invalid_count = invalid_count + ?,
            risky_count = risky_count + ?
          WHERE id = ?
        `).run(
          result.status === 'valid' ? 1 : 0,
          result.status === 'invalid' ? 1 : 0,
          result.status === 'risky' ? 1 : 0,
          jobId
        );
        
        processedCount++;
        if (result.status === 'valid') validCount++;
        else if (result.status === 'invalid') invalidCount++;
        else if (result.status === 'risky') riskyCount++;
        
      } catch (error: any) {
        db.prepare(`
          UPDATE verification_results SET
            status = 'error',
            error_message = ?
          WHERE id = ?
        `).run(error.message || 'Unknown error', row.id);
        
        db.prepare('UPDATE verification_jobs SET processed_count = processed_count + 1 WHERE id = ?').run(jobId);
        processedCount++;
      }
    });
    
    await Promise.allSettled(promises);

    // Yield to event loop so sending/scraping are not blocked
    await new Promise(resolve => setImmediate(resolve));

    // Log progress every 100 emails
    if (processedCount % 100 < concurrency) {
      console.log(`[Verifier] Job ${jobId.slice(0, 8)}... progress: ${processedCount}/${totalPending} (${validCount} valid, ${invalidCount} invalid, ${riskyCount} risky)`);
    }
  }
  
  // Complete the job
  db.prepare(`
    UPDATE verification_jobs SET
      status = 'completed',
      completed_at = datetime('now')
    WHERE id = ?
  `).run(jobId);
  
  activeJobs.delete(jobId);
  
  console.log(`[Verifier] Job ${jobId.slice(0, 8)}... completed: ${validCount} valid, ${invalidCount} invalid, ${riskyCount} risky (${totalPending} total)`);
}

// ═══ Cleanup ═════════════════════════════════════════════════════════

export function clearMxCache(): void {
  mxCache.clear();
}
