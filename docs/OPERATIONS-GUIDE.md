# Sales operations — ગુજરાતી માર્ગદર્શિકા

## શરૂ કરવાની રીત

1. **Team → Add team member**: salesperson અને teamleaderના અલગ accounts બનાવો.
2. **Services**: તમારી services બનાવો.
3. **Operations → Settings & integrations → Configure**: salespersonને leader, eligible services અને maximum open leads આપો. 0 capacity એટલે unlimited; કોઈ service પસંદ ન હોય એટલે બધી services.
4. **Assignment & alerts**: manual, round-robin અથવા workload પ્રમાણે assignment પસંદ કરો. આ નિયમ નવા unassigned leadsને લાગુ પડે છે. જૂના leads માટે Assign unassigned leads છે.
5. **CRM → Import leads**: .xlsx અથવા CSV (1 MB, 500 rows) પસંદ કરીને column mapping કરો. Excelની પ્રથમ worksheet લેવાય છે. Mobile numberને Text તરીકે રાખો. Duplicate skip પસંદ હોય તો service + phone પ્રમાણે duplicate rows છોડાય છે; અન્ય ખોટી row હોય તો આખી import અટકે છે.

## રોજનું કામ

- CRMમાં Hot / Warm / Cold priority, calls, discussion, follow-ups અને lost/deferred reason લખો.
- **Operations → Follow-ups & priorities**: overdue follow-ups અને first-call escalation જુઓ. Team leaderને પોતાની team જ દેખાય છે.
- Browser alerts વૈકલ્પિક છે અને dashboard ખુલ્લું હોય ત્યારે ચાલે છે. Dashboard બંધ હોય ત્યારે push, WhatsApp કે email reminder મોકલાતો નથી.
- **Targets**: salesperson + service + month માટે daily calls, monthly calls, sales અને service valueના targets સાચવો. Actuals સચોટ call/confirmation date પરથી આવે છે.
- **Delivery**: confirmed purchase માટે onboarding tasks આપમેળે બને છે; owner, tasks, notes અને status update કરો.
- **Renewals**: service end date પ્રમાણે upcoming/overdue renewals. Adminને જૂના PDC clientsના renewals પણ દેખાય છે. Renewed status પૈસા કે નવો purchase બનાવતો નથી; તે અલગથી નોંધો.
- **Commission**: confirmation સમયે rate lock થાય છે; received amount પર earned commission ગણાય છે. Record paid માત્ર અગાઉ ચૂકવેલા commissionની નોંધ છે, પૈસા ટ્રાન્સફર નથી. જૂના purchases માટે default 0% છે. Collections ઘટાડાય અને commission અગાઉ ચૂકવાઈ ગયું હોય તો negative balance adjustment બતાવે છે.

## WhatsApp અને calls

- Admin Operations → WhatsAppમાં templates બનાવે. {{name}} અને {{service}} manual draftમાં બદલાય છે.
- Lead → Open → WhatsApp follow-up: customer opt-in નોંધ્યા પછી draft ખોલો. WhatsAppમાં તમે મોકલો ત્યાં સુધી તે sent તરીકે ગણાતો નથી.
- Call history → Recording & summary: consent સાથે HTTPS recording link અને transcript સાચવી શકાય છે. Recording અને transcription આપમેળે થતું નથી.
- AI summary માટે provider connect કરવો પડે; transcript providerને મોકલવા checkbox છે. Generated summary માણસે ચકાસવી.

## બહારની connections — હાલમાં setup જરૂરી

Excel સીધું ચાલે છે. Website/Meta automation માટે authenticated intake endpoint તૈયાર છે; સીધી Meta webhook subscription બનાવેલી નથી.

- Operations → Settings → Create intake token. Token trusted integration serverમાં રાખો. POST `/api/intake/leads` with `Authorization: Bearer TOKEN`, JSON `externalId`, `name`, `phone`, `serviceId`, `source`. Source + externalId retry idempotent છે. Intake limit 60 requests/minute per process. Token rotationથી જૂનો token બંધ થાય છે.
- WhatsApp server environment: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, optional `WHATSAPP_API_VERSION`. Only approved templates without variable components are supported for API sending. Provider acceptance is not delivery confirmation. Timeout requests are retained as uncertain and are not automatically resent.
- AI server environment: `OPENAI_API_KEY`, optional `OPENAI_SUMMARY_MODEL` (default `gpt-4.1-mini`). API credentials are never returned to the browser or JSON export.
- Provider-backed sends/AI summaries have not been tested against a paid live provider because connections were not supplied.

## Backup અને તપાસ

Full CRM export includes operations data (targets, profiles, deliveries, renewals, commission, messages). Credentials and intake token are excluded; SQLite backup preserves the complete server state.

Reference implementations: [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Meta template message schema](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/TemplateObject/).
