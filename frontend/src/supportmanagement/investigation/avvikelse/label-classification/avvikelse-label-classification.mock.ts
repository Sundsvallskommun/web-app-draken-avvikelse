import type { LabelClassificationCatalog } from './label-classification.types';

const AVVIKELSE_LABEL_CLASSIFICATION_GROUP = {
  HSL: 'HSL',
  SOL_LSS: 'SOL_LSS',
} as const;

export type AvvikelseLabelClassificationGroup =
  (typeof AVVIKELSE_LABEL_CLASSIFICATION_GROUP)[keyof typeof AVVIKELSE_LABEL_CLASSIFICATION_GROUP];

/**
 * Local working catalog for the IAF/VOF investigation lab. The codes are
 * deliberately separate from display names so selections survive copy changes.
 * Replace this record with catalogs mapped from SupportManagement metadata once
 * that API contract is available.
 */
export const AVVIKELSE_LABEL_CLASSIFICATION_CATALOGS = {
  [AVVIKELSE_LABEL_CLASSIFICATION_GROUP.HSL]: {
    code: 'HSL',
    displayName: 'HSL',
    types: [
      {
        code: 'hsl_annat',
        displayName: 'Annat',
        subtypes: [
          { code: 'hsl_annat_bristande_information', displayName: 'Bristande information' },
          { code: 'hsl_annat_ej_foljt_hygienrutin', displayName: 'Ej följt hygienrutin' },
          {
            code: 'hsl_annat_ej_utford_halso_och_sjukvardsordination',
            displayName: 'Ej utförd hälso- och sjukvårdsordination',
          },
          {
            code: 'hsl_annat_medicinteknik_personliga_hjalpmedel',
            displayName: 'Medicinteknik - Personliga hjälpmedel',
          },
          {
            code: 'hsl_annat_medicinteknik_utrustning',
            displayName: 'Medicinteknik - Utrustning',
          },
          { code: 'hsl_annat_skada', displayName: 'Skada' },
          { code: 'hsl_annat_sjalvmord', displayName: 'Självmord' },
        ],
      },
      {
        code: 'hsl_fall',
        displayName: 'Fall',
        subtypes: [
          { code: 'hsl_fall_egen_aktivitet_hjalpmedel', displayName: 'Fall egen aktivitet - Hjälpmedel' },
          { code: 'hsl_fall_med_personal_hjalpmedel', displayName: 'Fall med personal - Hjälpmedel' },
          {
            code: 'hsl_fall_vid_forflyttning_med_personal',
            displayName: 'Fall vid förflyttning med personal',
          },
          {
            code: 'hsl_fall_vid_patientens_egna_aktiviteter',
            displayName: 'Fall vid patientens egna aktiviteter',
          },
        ],
      },
      { code: 'hsl_fall_utan_skada', displayName: 'Fall utan skada', subtypes: [] },
      { code: 'hsl_kad', displayName: 'KAD', subtypes: [] },
      {
        code: 'hsl_lakemedel',
        displayName: 'Läkemedel',
        subtypes: [
          { code: 'hsl_lakemedel_annat', displayName: 'Annat' },
          { code: 'hsl_lakemedel_fel_dos', displayName: 'Fel dos' },
          { code: 'hsl_lakemedel_fel_person', displayName: 'Fel person' },
          { code: 'hsl_lakemedel_felaktig_administrering', displayName: 'Felaktig administrering' },
          { code: 'hsl_lakemedel_forlust', displayName: 'Förlust av läkemedel' },
          { code: 'hsl_lakemedel_fordrojd_dos', displayName: 'Fördröjd dos' },
          { code: 'hsl_lakemedel_kommunikation_information', displayName: 'Kommunikation/Information' },
          { code: 'hsl_lakemedel_saknas', displayName: 'Läkemedel saknas' },
          { code: 'hsl_lakemedel_stold', displayName: 'Stöld av läkemedel' },
          { code: 'hsl_lakemedel_utebliven_dos', displayName: 'Utebliven dos' },
        ],
      },
      { code: 'hsl_lakemedelsautomat', displayName: 'Läkemedelsautomat', subtypes: [] },
      { code: 'hsl_munhalsa', displayName: 'Munhälsa', subtypes: [] },
      {
        code: 'hsl_nutrition',
        displayName: 'Nutrition',
        subtypes: [
          { code: 'hsl_nutrition_viktnedgang', displayName: 'Viktnedgång' },
          { code: 'hsl_nutrition_viktuppgang', displayName: 'Viktuppgång' },
        ],
      },
      {
        code: 'hsl_rehab',
        displayName: 'Rehab',
        subtypes: [
          { code: 'hsl_rehab_ej_utford_ordination', displayName: 'Ej utförd ordination' },
          { code: 'hsl_rehab_hjalpmedel', displayName: 'Hjälpmedel' },
          { code: 'hsl_rehab_utebliven_bedomning_behandling', displayName: 'Utebliven bedömning/behandling' },
        ],
      },
      {
        code: 'hsl_trycksar',
        displayName: 'Trycksår',
        subtypes: [
          { code: 'hsl_trycksar_grad_1', displayName: 'Grad 1: Syns som en rodnad på huden' },
          { code: 'hsl_trycksar_grad_2', displayName: 'Grad 2: Blåsbildning eller avskavning av överhuden' },
          {
            code: 'hsl_trycksar_grad_3',
            displayName: 'Grad 3: Ett sår har utvecklats som även omfattar underhuden',
          },
          {
            code: 'hsl_trycksar_grad_4',
            displayName: 'Grad 4: Djup vävnadsskada som också omfattar muskel-, ben- eller stödjevävnad',
          },
        ],
      },
      {
        code: 'hsl_vri',
        displayName: 'VRI (Vårdrelaterad infektion)',
        subtypes: [
          { code: 'hsl_vri_esbl', displayName: 'ESBL' },
          { code: 'hsl_vri_mrsa', displayName: 'MRSA' },
          { code: 'hsl_vri_vre', displayName: 'VRE' },
        ],
      },
      {
        code: 'hsl_palliativ_vard',
        displayName: 'Vård i livets slut (Palliativ vård)',
        subtypes: [
          { code: 'hsl_palliativ_vard_brytpunktssamtal', displayName: 'Brytpunktssamtal' },
          { code: 'hsl_palliativ_vard_smartskattning', displayName: 'Smärtskattning' },
        ],
      },
    ],
  },
  [AVVIKELSE_LABEL_CLASSIFICATION_GROUP.SOL_LSS]: {
    code: 'SOL_LSS',
    displayName: 'SOL/LSS',
    types: [
      {
        code: 'sol_lss_brister_arbetssatt_metoder_rutiner',
        displayName: 'Brister i arbetssätt, metoder och rutiner',
        subtypes: [
          {
            code: 'sol_lss_brister_arbetssatt_saknar_kunskapsstod',
            displayName: 'Arbetssätt eller metod saknar kunskapsstöd',
          },
          {
            code: 'sol_lss_brister_arbetssatt_bristande_kompetens',
            displayName: 'Bristande kompetens för uppdraget',
          },
          {
            code: 'sol_lss_brister_arbetssatt_brister_i_rutin',
            displayName: 'Brister i rutin, saknas eller följs inte',
          },
          {
            code: 'sol_lss_brister_arbetssatt_metod_anvands_felaktigt',
            displayName: 'Metod används felaktigt',
          },
          {
            code: 'sol_lss_brister_arbetssatt_otillracklig_introduktion',
            displayName: 'Otillräcklig introduktion',
          },
          {
            code: 'sol_lss_brister_arbetssatt_otydligt_ansvar',
            displayName: 'Otydligt arbetssätt eller ansvar',
          },
        ],
      },
      {
        code: 'sol_lss_brister_bemotande_anstallda',
        displayName: 'Brister i bemötande av anställda m.fl.',
        subtypes: [
          {
            code: 'sol_lss_brister_bemotande_delaktighet_inflytande',
            displayName: 'Bristande delaktighet och inflytande',
          },
          {
            code: 'sol_lss_brister_bemotande_kommunikation',
            displayName: 'Bristande kommunikation',
          },
          { code: 'sol_lss_brister_bemotande_diskriminering', displayName: 'Diskriminering' },
          {
            code: 'sol_lss_brister_bemotande_oprofessionellt',
            displayName: 'Oprofessionellt eller respektlöst bemötande',
          },
        ],
      },
      {
        code: 'sol_lss_brister_fysisk_miljo_utrustning_teknik',
        displayName: 'Brister i fysisk miljö, utrustning (hjälpmedel) och teknik',
        subtypes: [
          {
            code: 'sol_lss_brister_fysisk_miljo_brandsakerhet_lassystem',
            displayName: 'Bristande brandsäkerhet eller låssystem',
          },
          {
            code: 'sol_lss_brister_fysisk_miljo_otrygg_olamplig',
            displayName: 'Otrygg eller olämplig fysisk miljö, begränsning av självständighet',
          },
          {
            code: 'sol_lss_brister_fysisk_miljo_hjalpmedel_felaktigt',
            displayName: 'Tekniska hjälpmedel används felaktigt',
          },
          {
            code: 'sol_lss_brister_fysisk_miljo_utrustning_saknas',
            displayName: 'Utrustning saknas eller fungerar inte',
          },
        ],
      },
      {
        code: 'sol_lss_brister_rattssakerhet',
        displayName: 'Brister i rättssäkerhet vid handläggning och genomförande',
        subtypes: [
          {
            code: 'sol_lss_brister_rattssakerhet_avsaknad_dokumentation',
            displayName: 'Avsaknad av dokumentation',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_beslut_verstalls_inte',
            displayName: 'Beslut verkställs inte',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_barnperspektiv',
            displayName: 'Bristande barnperspektiv',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_samtycke_information',
            displayName: 'Bristande samtycke eller information',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_saklighet_opartiskhet',
            displayName: 'Brister i saklighet och opartiskhet',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_forsenad_dokumentation',
            displayName: 'Försenad dokumentation',
          },
          {
            code: 'sol_lss_brister_rattssakerhet_atgard_utan_lagstod',
            displayName: 'Åtgärder genomförs utan lagstöd, t ex begränsningsåtgärder',
          },
        ],
      },
      {
        code: 'sol_lss_brister_utforande_insatser',
        displayName: 'Brister i utförandet av insatser',
        subtypes: [
          {
            code: 'sol_lss_brister_utforande_avvikelse_genomforandeplan',
            displayName: 'Avvikelse från genomförandeplan',
          },
          {
            code: 'sol_lss_brister_utforande_kontinuitet',
            displayName: 'Bristande kontinuitet',
          },
          {
            code: 'sol_lss_brister_utforande_forsummelse_underlatenhet',
            displayName: 'Försummelse / underlåtenhet',
          },
          {
            code: 'sol_lss_brister_utforande_insats_uteblir',
            displayName: 'Insats uteblir, utförs delvis, för sent eller fel',
          },
        ],
      },
      {
        code: 'sol_lss_ekonomiska_overgrepp',
        displayName: 'Ekonomiska övergrepp (oegentligheter)',
        subtypes: [
          {
            code: 'sol_lss_ekonomiska_overgrepp_bristande_redovisning',
            displayName: 'Bristande redovisning av privata medel',
          },
          {
            code: 'sol_lss_ekonomiska_overgrepp_otillaten_anvandning',
            displayName: 'Otillåten användning av brukarens medel',
          },
          {
            code: 'sol_lss_ekonomiska_overgrepp_patryckningar',
            displayName: 'Påtryckningar att ge bort pengar eller egendom',
          },
          {
            code: 'sol_lss_ekonomiska_overgrepp_stold',
            displayName: 'Stöld av pengar eller ägodelar',
          },
        ],
      },
      {
        code: 'sol_lss_fysiska_overgrepp',
        displayName: 'Fysiska övergrepp',
        subtypes: [
          { code: 'sol_lss_fysiska_overgrepp_brukare', displayName: 'Våld mellan brukare' },
          {
            code: 'sol_lss_fysiska_overgrepp_personal_brukare',
            displayName: 'Våld mellan personal och brukare',
          },
        ],
      },
      {
        code: 'sol_lss_psykiska_overgrepp',
        displayName: 'Psykiska övergrepp',
        subtypes: [
          {
            code: 'sol_lss_psykiska_overgrepp_krankande_kontrollerande',
            displayName: 'Kränkande eller kontrollerande handlingar',
          },
        ],
      },
      { code: 'sol_lss_sexuella_overgrepp', displayName: 'Sexuella övergrepp', subtypes: [] },
    ],
  },
} as const satisfies Readonly<Record<AvvikelseLabelClassificationGroup, LabelClassificationCatalog>>;
