# Sales dashboard — કામ કરવાની રીત

## 1. Services અને Team તૈયાર કરો

**Services → Add service**માં તમારી દરેક service ઉમેરો. નામ, default price, કેટલા મહિના અને service પૂરી પાડનાર leaderનું નામ ભરો.

- **PDC counselling:** purchase confirm થાય ત્યારે client અને monthly meetings બને છે.
- **General service:** બીજી services માટે પસંદ કરો. Purchase, leader અને payments CRMમાં રહેશે.

**Team → Add team member**માંથી salesperson અથવા nutritionistનું નામ, email અને password આપો. દરેક salesperson પોતાના accountથી login કરશે. Nutritionistને ફક્ત તેના નામે assign કરેલા clients દેખાશે. Admin password reset કરી શકે છે અથવા account disable કરી શકે છે.

## 2. Lead ઉમેરો અને assign કરો

**CRM → New Lead**માં નામ, mobile, service, source, campaign details અને salesperson પસંદ કરો. Sourceમાં Instagram, WhatsApp, website, referral અથવા બીજું કોઈપણ નામ લખી શકો છો.

એક જ mobile number માટે અલગ servicesની leads બનાવી શકાય છે. એક જ service માટે duplicate lead રોકાય છે.

ઘણી leads માટે **Import leads** પસંદ કરો. CSVમાં `name,phone` જરૂરી છે; `city,source,notes,sourcedetails` વૈકલ્પિક છે. Import પહેલાં service અને salesperson પસંદ કરો. Preview પછી import કરો. કોઈ rowમાં error હોય તો એક પણ row save નહીં થાય; file સુધારી ફરી import કરી શકો છો.

## 3. Salespersonનું રોજનું કામ

1. પોતાના loginથી CRM ખોલો અને assigned leads જુઓ.
2. Call કર્યા પછી **Log call** કરો: outcome, stage, discussion અને follow-up ભરો. Duration ખબર હોય તો secondsમાં લખો.
3. Brochure મોકલવો, meeting ગોઠવવી અથવા બીજી કામગીરી માટે lead ખોલીને **Add activity note** કરો.
4. Today’s and overdue follow-upsમાં બાકી calls જુઓ.
5. ગ્રાહક ખરીદવા તૈયાર થાય ત્યારે **Record purchase**માં amount, received amount અને service details ભરો.

Callનો સમય અને logged-in user આપમેળે નોંધાય છે. Browserમાં call કરવાથી નોંધ આપમેળે બનતી નથી; Log call કરવું જરૂરી છે. Existing CallFlow connectorથી device calls sync થઈ શકે છે.

## 4. Admin confirmation અને payments

CRMમાં **Purchases awaiting admin approval**માંથી purchase તપાસો. Payment સાચું હોય તો **Confirm purchase** કરો. ખોટી entry હોય તો reason સાથે **Cancel pending purchase** કરો અને સાચી entry ફરી નોંધો.

General service માટે confirmed lead ખોલીને **Record payment**થી આગળની collection નોંધો. PDC માટે હાલની **History → Payment Installments** અથવા **Payments** workflow વાપરો. Confirmed leadનો audit trail જળવાય છે.

## 5. Admin reports

**Sales Reports**માં date range, service, source અને salesperson filter પસંદ કરીને **Apply filters** કરો.

| Report | શું દેખાશે |
|---|---|
| Salespeople | Calls, outcomes, connection rate, talk time, purchases, collection, pending અને conversion |
| Services | દરેક service પર leads, calls, કામ થયેલી leads, confirmed purchases અને amounts |
| Lead sources | કયા sourceમાંથી કેટલું કામ અને કેટલું વેચાણ થયું |
| Lead effort | દરેક lead પર calls/activities, છેલ્લી discussion, stage અને follow-up; Openથી સંપૂર્ણ history |
| Call log | દરેક callનો સમય, salesperson, service, outcome, duration અને discussion |

**Export current table**થી પસંદ કરેલો report CSVમાં મળશે. એક વ્યક્તિ બે services ખરીદે તો **2 confirmed purchases અને 1 unique confirmed person** ગણાય છે. Date filters IST પ્રમાણે છે. Collection amounts selected purchasesની હાલની સ્થિતિ બતાવે છે; તે દિવસના cash-flow report નથી. Missing durationને talk timeમાં ગણવામાં આવતું નથી.

**Overview → Sales operations**માં open leads, આજના calls, confirmed purchases, pending approvals અને unassigned leadsનું summary દેખાય છે.

## Data અને live website

Teamમાંથી CRM backup તથા ઉપરના Exportમાંથી client backup લઈ શકો છો. Full accounts/sessions માટે serverના database volumeનો backup જરૂરી છે. CRM JSON export માટે automatic full restore screen નથી.

આ ફેરફારો local projectમાં છે. Live website પર વાપરવા પહેલાં નવી build deploy કરવી પડશે અને existing database volume જાળવવો પડશે. Social platformsમાંથી automatic lead fetching અથવા call audio recording હાલ જોડાયેલાં નથી.
