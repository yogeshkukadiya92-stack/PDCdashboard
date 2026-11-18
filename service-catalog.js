// Service wording and order from the supplied patient-entry reference.
export const referenceServices = [
  "WEIGHT LOSS AND THYROID",
  "Irregular periods",
  "PADA ABHYANGA",
  "Yog basti",
  "Shirodhara",
  "Facial Treatment",
  "Nasya treatment",
  "Uttar Basti",
  "Matra basti",
  "Leech Treatment",
  "Consultation",
  "Follow-up",
  "Weight Loss",
  "Skin Care",
  "Hair Treatment",
  "Panchakarma",
  "Garbhasanskar",
  "Diet Counseling",
  "Therapy Session",
];

export function orderServices(services) {
  const rank = (service) => {
    const index = referenceServices.indexOf(service.name);
    return index < 0 ? referenceServices.length : index;
  };
  return [...services].sort((a, b) => rank(a) - rank(b));
}
