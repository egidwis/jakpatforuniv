// Translation files for English and Indonesian

export type Language = 'en' | 'id';

export const translations = {
  en: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Submit your survey to 2 million Jakpat respondents",

    // Step Navigation
    step1: "Survey Details",

    // Step One - Survey Source Selection
    surveyDetails: "Survey Details",
    chooseSurveySource: "Choose your survey source",

    // Google Form Option
    googleFormOption: "Google Form",
    googleFormDescription: "Import questions from Google Forms with 100% accuracy. Data automatically filled from your form.",
    googleDriveAccess: "Access to Google Drive",

    // Other Source Option
    otherSourceOption: "From other source",
    otherSourceDescription: "Enter Google Form URL or fill in survey data manually.",
    manualInputRequired: "Manual input required",

    // Google Drive Import
    importFromGoogleForms: "Import Questions from Google Forms",
    backToSourceSelection: "← Back to source selection",
    connectToGoogleDrive: "Connect to Google Drive",
    searchGoogleForms: "Search Google Forms",
    selectForm: "Select Form",
    importing: "Importing...",
    importSuccess: "Form imported successfully!",

    // GoogleDriveImport Component
    importQuestionsTitle: "Import Questions from Google Forms",
    accessGoogleDriveTitle: "Access to Google Drive",
    connectGoogleMessage: "Connect your Google account so we can access your files.",
    agreeToGiveAccess: "I agree to give Google Drive access to Jakpat based on",
    privacyPolicy: "Privacy Policy",
    connect: "Connect",
    connecting: "Connecting...",
    connectedSuccessMessage: "Successfully connected to Google Drive",
    authenticationSuccessful: "Authentication successful",
    failedToConnect: "Failed to connect to Google Drive",
    pleaseAcceptPrivacy: "Please accept the privacy policy first",
    disconnectedSuccess: "Successfully disconnected from Google Drive",
    failedToDisconnect: "Failed to disconnect",
    searchAndImportForms: "Search and import Google Forms",
    searchingForms: "Searching Forms...",
    selectGoogleForm: "Select Google Form",
    fromYourDrive: "from your Drive",
    willOpenPicker: "Will open Google Picker to select your form",

    // Google Drive Connect Steps
    googleConnectTitle: "Connect Google Account",
    googleConnectDescription: "We need read-only access to your Google Drive and Google Forms",
    permissionDrive: "Google Drive (read only)",
    permissionForms: "Google Forms (read only)",
    googleConnectButton: "Connect with Google",
    googleConnectedTitle: "Connected to Google Drive",
    googleConnectedMessage: "Your Google Account has been successfully connected",
    titleSelectForm: "Select Google Form",
    descriptionSelectForm: "Choose the Google Form file you want to advertise from your Google Drive.",
    buttonSelectForm: "Find File in Drive",

    // Status Page
    pageTitle: "Track Status",
    pageSubtitle: "Monitor the progress of your survey submissions in real-time.",
    statusAll: "All Status",
    statusInReview: "Under Review",
    statusWaitingPayment: "Awaiting Payment",
    statusScheduling: "Slot Reserved",
    statusScheduled: "Scheduled",
    statusPublishing: "Ready to Launch",
    statusCompleted: "Completed 🎉",
    statusInReviewHelper: "Your survey is being reviewed by our team.",
    statusInReviewCompletedHelper: "Your survey has been reviewed.",
    statusPaymentHelper: "Waiting for your payment to proceed.",
    statusPaymentSuccessHelper: "Payment received and confirmed.",
    statusSchedulingHelper: "Your preferred schedule is being arranged.",
    statusSchedulingCompletedHelper: "Your slot has been successfully reserved.",
    statusScheduledHelper: "Ready to Air",
    statusPublishingHelper: "Your campaign is being prepared for launch.",
    statusPublishingLiveHelper: "Your survey ad is now live! 🚀",
    statusPublishingCompletedHelper: "Your survey is now live.",
    statusCompletedHelper: "Your campaign has been successfully completed.",
    chooseSchedule: "Choose Schedule",
    rescheduleSlot: "Reschedule",
    statusLiveUntil: "Live until",
    statusAwaitingInvoiceHelper: "Waiting for the admin to issue your invoice. Your payment link will be available shortly.",
    payNow: "Pay Now",
    contactSupport: "Need help? Contact Support",
    downloadReceipt: "Download Receipt",
    viewInvoice: "View Invoice",
    airingPeriods: "Airing Periods",
    airingOriginal: "Original",
    extendHistory: "Duration Extension History",
    payExtension: "Pay Extension",
    extendedLabel: "Extended",
    extendWaitingPaymentAlertTitle: "Extension Awaiting Payment",
    extendWaitingPaymentAlert: "Admin has approved your duration extension. Complete the payment so it can be scheduled and aired.",
    extendExpiredHint: "This extension's payment link has expired. Please reschedule the extension via admin / Contact Support.",
    extStatusWaitingPayment: "Awaiting Payment",
    extStatusPaid: "Paid",
    extStatusScheduled: "Scheduled",
    extStatusLive: "Live",
    extStatusCompleted: "Completed",
    extStatusCancelled: "Cancelled",
    extStatusExpired: "Expired",
    noSubmissions: "No submissions yet",
    createFirstSurvey: "Create New Survey",
    noSubmissionsDesc: "You haven't submitted any surveys yet. Create your first survey to get started.",
    submittedOn: "Submitted on",
    days: "Days",
    adDuration: "Ad Duration",

    winner: "winner",

    // Form Fields
    completeFormBelow: "Complete the form below",
    googleFormLink: "Google Form Link",
    googleFormLinkPlaceholder: "https://docs.google.com/forms/...",
    googleFormLinkHelp: "Enter Google Form link or shortlink (forms.gle/abc) and click 'Preview' to auto-fill fields below. Non-Google Form links can be filled manually.",

    surveyTitle: "Survey Title",
    surveyTitlePlaceholder: "Enter survey title",
    surveyTitleFromGoogleDrive: "(from Google Drive)",

    questionCount: "Number of Questions",
    questionCountPlaceholder: "Enter number of questions",

    surveyDescription: "Survey Description",
    surveyDescriptionPlaceholder: "Enter survey description",

    // Buttons
    preview: "Preview",
    loading: "Loading...",
    continue: "Continue",
    cancel: "Cancel",
    save: "Save",
    cancelSubmission: "Cancel",
    confirmCancelSubmission: "Are you sure you want to cancel and start over? This will remove your current draft.",

    // Messages
    importedFromGoogle: "Imported from Google Drive",
    dataAutoFilled: "Data automatically filled from Google Forms",

    // Validation
    required: "This field is required",
    invalidUrl: "Please enter a valid URL",

    // Footer
    footer: "Jakpat for Universities © 2025",

    // Total Cost
    totalCost: "Total Cost",
    perQuestion: "questions x 1 (day)",

    // Step Two Fields
    surveyDurationLabel: "Ad survey duration (days)",
    surveyDurationPlaceholder: "Enter duration in days (1-30)",
    surveyDurationHelp: "Ad period will be confirmed by admin via WhatsApp after payment",
    prizePerWinnerLabel: "Prize per winner",
    prizePerWinnerPlaceholder: "Min. Rp 25,000",
    winnerCountLabel: "Number of Winners",
    winnerCountPlaceholder: "2-5 winners",
    incentiveDistributionInfo: "Jakpat will distribute incentives to respondents automatically",
    maxWinnerWarning: "Currently, we prioritize surveys with a maximum of 5 winners. For more information, please",
    contactAdmin: "contact admin",
    totalIncentiveRequired: "Total Incentive Required",
    recommendation: "Recommendation",
    perWinner: "/winner",
    respondentCriteriaPlaceholder: "Example: Age 18-35 years, Jakarta Domicile, Active Student",
    respondentCriteriaLabel: "Respondent Criteria",
    respondentCriteriaHelp: "Respondent criteria are displayed on the ad *only as a guide*. Since this service advertises surveys to a *random audience profile*, the characteristics of respondents who participate may vary.",


    // Step One Method Selection
    startByFillingData: "Start by filling in survey data",
    chooseMethodSuitable: "Choose the method that suits you best.",
    importFromGoogleForm: "Import from Google Form",
    manualFill: "Fill Manually",
    backButton: "Back",

    // Step Three - Slot Reservation
    slotReservationTitle: "Ad Slot Reservation",
    slotReservationInfo: "Choose the start date for your survey ad. Ads on the <strong>Auto-Approval</strong> track will be processed immediately without manual admin review.",
    slotStartDateLabel: "Ad Start Date",
    slotDurationLabel: "Ad Duration",
    slotFixedTimeTitle: "Ad goes live at 15:00 WIB",
    slotFixedTimeDesc: "Start time is set automatically for all ads.",
    slotErrorNoDate: "Please select a start date for your ad.",
    slotErrorFull: "Slots for the selected date range are full (max 3 per day). Please choose a different date.",
    slotErrorLoad: "Failed to load slot availability. Please try again.",
    recommended: "RECOMMENDED",
    googleFormImportTitle: "Import from Google Form",
    googleFormImportDescription: "Fastest way. Data auto-filled, instant pricing, and start survey immediately.",
    benefit100Accurate: "100% Accurate (Auto-fill)",
    benefitAutoFill: "Instant Payment (No Review)",
    benefitSaveTime: "Directly Schedule Ad",
    manualFillTitle: "Fill Manually",
    manualFillDescription: "Use link from other platforms (Typeform, Qualtrics) or for specific needs.",
    fillManually: "Fill Manually",
    canChangeMethodLater: "You can change the method later if needed",
    requiresAdminReview: "Goes through admin verification",
    byContinuingAgree: "By continuing, you agree to our",
    andText: "and",
    termsConditions: "Terms and Conditions",
    noGoogleForm: "Don't have a Google Form?",
    troubleFillingManual: "Tired of manual entry?",
    fillManualOnly: "Fill Manually Instead",

    // Validation Error Messages - StepOne
    errorEnterSurveyUrl: "Please enter survey URL first",
    errorSurveyTitleEmpty: "Survey title cannot be empty",
    errorSurveyDescriptionEmpty: "Survey description cannot be empty",
    errorQuestionCountZero: "Number of questions must be greater than 0",

    // Validation Error Messages - StepOneFormFields
    errorSurveyLinkEmpty: "Survey link cannot be empty",
    errorTitleEmpty: "Survey title cannot be empty",
    errorDescriptionEmpty: "Survey description cannot be empty",
    errorQuestionCountInvalid: "Number of questions must be greater than 0",
    errorCompleteAllFields: "Please complete all required fields",

    // Step Four Sections
    surveyOverview: "Survey Overview",
    promoCode: "Promo Code (Optional)",
    costBreakdown: "Cost Breakdown",

    // Review Items
    questions: "Questions",
    duration: "Duration",
    incentive: "Incentive",
    targetCriteria: "Target Criteria",
    contactInfo: "Contact Info",

    // Promo Code
    voucherCodeLabel: "Voucher/Referral Code",
    voucherCodePlaceholder: "Enter code if any",
    voucherValid: "Voucher applied successfully!",

    // Cost Breakdown
    adCampaignCost: "Ad Campaign Cost",
    respondentIncentive: "Respondent Incentive",
    subtotal: "Subtotal",
    discount: "Discount",
    ppn: "VAT 11%",
    priceExcludesTax: "excl. VAT 11%",
    totalPayment: "Total Payment",
    totalIncludesTax: "Total includes VAT 11%",
    disclaimer: "By proceeding, you agree to our Terms of Service and Privacy Policy",

    // Buttons
    proceedPayment: "Proceed to Payment",
    submitForReview: "Submit for Admin Review",

    // Payment Checkout Page
    checkoutTitle: "Complete Your Payment",
    checkoutSubtitle: "Your survey slot has been secured. Complete your payment before the time runs out.",
    checkoutTimerLabel: "Payment time remaining",
    checkoutSchedule: "Schedule",
    checkoutTotalLabel: "Total Payment",
    checkoutPaymentInfo: "Payment is processed securely via DOKU. Available methods: QRIS, Virtual Account, Credit Card.",
    checkoutPayNow: "Pay Now",
    checkoutProcessing: "Opening payment...",
    checkoutAlreadyPaid: "Already paid? Check payment status",
    checkoutCheckingStatus: "Checking status...",
    checkoutExpiredTitle: "Ad Slot Expired",
    checkoutExpiredDesc: "Your payment time has run out (1 hour). Your survey slot has been released.",
    checkoutBackDashboard: "Back to Dashboard",
    checkoutPickAgain: "Pick New Schedule",
    checkoutPaidSuccess: "Payment confirmed! Redirecting to status page...",
    checkoutNotPaidYet: "Payment not received yet. Please complete your payment first.",
    checkoutCheckError: "Failed to check payment status. Please try again.",
    checkoutPaymentError: "Failed to open payment link. Please try again.",

    // Validation Error Messages - StepTwo
    errorRespondentCriteriaEmpty: "Respondent criteria cannot be empty",
    errorSurveyDurationZero: "Survey duration must be greater than 0 days",
    errorWinnerCountRange: "Number of winners must be between 2-5 people",
    errorMinimumPrize: "Prize per winner minimum Rp 25,000",

    // Validation Error Messages - StepTwoConfig
    errorRespondentCriteriaRequired: "Respondent criteria cannot be empty",
    errorDurationZero: "Duration must be greater than 0 days",
    errorDurationMax: "Maximum duration is 30 days",
    errorMinWinners: "Minimum 2 winners",
    errorMaxWinners: "Maximum 5 winners",
    errorMinPrize: "Minimum Rp 25,000 per winner",
    errorFixFields: "Please fix the problematic fields",

    // Validation Error Messages - Invoice contact (StepCheckout)
    errorFullNameEmpty: "Full name cannot be empty",
    errorEmailInvalid: "Invalid email format",
    errorPhoneMinLength: "Phone number minimum 10 digits",

    // Validation Error Messages - StepFour
    errorCompleteAllSurveyData: "Please complete all survey data",
    errorSavingData: "Failed to save data. Please try again.",
    errorPaymentFailed: "Failed to create payment. Please try again later.",
    errorSavingDataGeneric: "An error occurred while saving data. Please try again.",
    errorTermsRequired: "Please accept the Terms of Service and Privacy Policy",

    // Success Messages - StepFour
    successFormSubmitted: "Form successfully submitted! You will be redirected to the success page.",
    successPaymentRedirect: "Success! You will be redirected to the payment page.",

    // Success Messages - GoogleDriveImportSimple
    successConnectedGoogleDrive: "Successfully connected to Google Drive",
    successFormImported: "Form \"{title}\" successfully imported",
    reviewSuccess: "Review success",

    // Error Messages - GoogleDriveImportSimple
    errorConnectGoogleDrive: "Failed to connect to Google Drive",
    errorConnectFirst: "Please connect to Google Drive first",
    errorExtractFormData: "Failed to extract form data",
    errorSelectForm: "Failed to select form",
    reviewingSystem: "Survey is being reviewed by the system...",
    errorFormNotPublished: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorFormRestricted: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorInsufficientPermissionsTitle: "Insufficient Permissions",
    errorInsufficientPermissionsDesc: "Please check ALL permission checkboxes so we can read your form. Don't worry, we only read the specific file you select.",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data successfully imported from Google Drive",

    // Section Titles - StepOne
    surveyInformation: "Survey Information",
    surveyConfiguration: "Ad Configuration",
    incentiveSettings: "Incentive Settings",
    surveyConfigurationDescription: "Define respondent criteria and incentives for your survey",

    // Section Titles - StepThree
    personalData: "Personal Data",

    // Section Titles - StepFour
    reviewAndPayment: "Review & Payment",

    // Personal Data Warning Modal
    personalDataWarningTitle: "Wait! Personal Data Detected",
    personalDataWarningSubtitle: "We detected questions that may collect sensitive personal data",
    personalDataDetectedLabel: "Questions detected:",
    personalDataPolicyExplanation: "The following data collection is restricted:",
    personalDataExample1: "Personal Contact Info (Email/Phone/WhatsApp)",
    personalDataExample2: "Full Name (as per ID) / NIK",
    personalDataExample3: "Home Address / Location",
    personalDataExample4: "File Uploads (Photo/Docs)",
    personalDataWhatHappens: "💡 Why is this restricted?",
    personalDataWhatHappensDetail: "Collecting this data can violate user privacy (UU PDP) and risks off-platform transactions. However, if this data is crucial for your research (e.g., recruitment), we can approve it after a manual review.",
    readTermsConditions: "Read Terms & Conditions",
    personalDataContinueButton: "I Understand, Submit for Manual Review",
    personalDataCancelButton: "Back to Edit Form",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Failed to connect to server. Please check your internet connection.",

    // Revision / Spam Status
    statusRevisionNeeded: "Revision Needed",
    revisionNeededTitle: "Please Resubmit",
    revisionNeededDescPart1: "There are issues during the review process, such as inaccessible links or information that does not comply with our",
    revisionNeededDescPart2: ". Please update the necessary data and resubmit your survey.",
    resubmit: "Resubmit",
    delete: "Delete",
    deleteSubmissionConfirm: "Are you sure you want to delete this submission? Deleted data cannot be recovered.",
    deleteSubmissionSuccess: "Submission successfully deleted",
    deleteSubmissionError: "Failed to delete submission",

    // JFU Kilat
    kilatUpgradeTitle: 'Upgrade to JFU Kilat!',
    kilatUpgradeTagline: '2-day ad results can be completed in just 2 hours!',
    kilatUpgradeDesc: 'Super fast distribution via specialized platform.',
    kilatBenefitNoPage: 'Direct push notifications to respondents',
    kilatBenefitFast: 'Respondent collection ~2 hours',
    kilatBenefitPrice: 'Price: Base rate + Rp 200,000',
    kilatUpgradeButton: 'Upgrade to JFU Kilat ⚡',
    statusKilatSlot: 'Kilat Schedule',
    statusKilatSlotHelper: 'Distribution start schedule',
    statusKilatSlotCompletedHelper: 'Schedule confirmed',
    statusKilatPublishing: 'Kilat Distribution',
    statusKilatPublishingHelper: 'Distribution in progress',
    statusKilatPublishingLiveHelper: 'Currently distributing',
    statusKilatPublishingCompletedHelper: 'Distribution complete',
    kilatModeActive: 'JFU Kilat Mode Active',
    kilatScheduleTitle: 'Select Kilat Distribution Schedule',
    kilatDuration: '~2 hours (Kilat ⚡)',
    kilatAddonLabel: 'JFU Kilat Add-on',
    kilatUndoButton: 'Back to Regular Ad',
    orderOverviewTitle: 'Order Overview',
    surveyAndTarget: 'Survey & Target',
    questionsAndDuration: 'Questions & Duration',
    respondentIncentiveLabel: 'Respondent Incentive',
    releaseSchedule: 'Release Schedule',
    ordererData: 'Orderer Info',
    institutionAndProfile: 'Institution & Profile',

    // Profile Page
    profileCompleteTitle: "Complete Your Profile",
    profileTitle: "Researcher Profile",
    onboardingDesc: "Before posting a survey, please complete your researcher profile. Only once — your next order won't ask for it again.",
    profileDesc: "This biodata is used as your researcher identity and the default invoice details for every order.",
    makeResearchEasier: "Make your research easier! 🚀",
    profilePageCalloutText: "Fill in your profile! This will help us provide better service customized to your needs.",
    invoiceDetailsChangeable: "Don't worry, invoice details can still be changed freely at checkout!",
    profilePersonalData: "Personal Data",
    fullName: "Full Name",
    fullNamePlaceholder: "Your full name",
    phoneNumber: "Phone Number",
    academicInfo: "Academic Information",
    university: "University",
    universityPlaceholder: "Type or select university",
    department: "Department",
    departmentPlaceholder: "Type or select department",
    academicStatus: "Academic Status",
    academicStatusPlaceholder: "Select your current academic status",
    referralTitle: "How did you hear about us?",
    referralPlaceholder: "Select one",
    referralSourceOtherPlaceholder: "Specify the source",
    saveAndContinue: "Save & Continue to Survey →",
    saveProfile: "Save Profile",
    profileSaveSuccess: "Profile saved successfully",
    profileSaveFailed: "Failed to save profile",
    fillRequiredFields: "Please complete all required fields correctly",

    // Validation Errors
    errFullNameRequired: "Full name is required",
    errPhoneNumberRequired: "Phone number is required",
    errPhoneNumberMin: "Phone number must be at least 10 digits",
    errUniversityRequired: "University is required",
    errDepartmentRequired: "Department is required",
    errAcademicStatusRequired: "Academic status is required",
    errReferralRequired: "Referral source is required",
    errReferralOtherRequired: "Please specify your referral source",

    // Academic Status Options
    academicStatusDosen: "👨‍🏫 Lecturer",
    academicStatusS3: "🎓 PhD Student",
    academicStatusS2: "🎓 Master's Student",
    academicStatusS1: "🎓 Bachelor's Student",
    academicStatusD3: "🎓 Diploma Student",
    academicStatusSMA: "📚 High School Student",

    // Referral Options
    referralTiktok: "TikTok",
    referralInstagram: "Instagram",
    referralLinkedIn: "LinkedIn",
    referralWebsiteJakpat: "Jakpat Website",
    referralBlogJakpat: "Jakpat Blog",
    referralGoogleSearch: "Google Search",
    referralChatGPT: "ChatGPT",
    referralRekomendasiDosen: "Lecturer Recommendation",
    referralRekomendasiTeman: "Friend's Recommendation",
    referralLainnya: "Other",

    // Invoice Details & Voucher
    invoiceDetailTitle: "Invoice Details",
    sameAsAccount: "Same as account data",
    invoiceContactHelp: "Invoice and payment notification for this order will be sent to the following contact.",
    invoiceNameLabel: "Full Name",
    invoiceNamePlaceholder: "Name as per ID",
    invoiceEmailLabel: "Invoice Email",
    invoiceEmailPlaceholder: "email@example.com",
    invoicePhoneLabel: "Phone Number",
    invoicePhonePlaceholder: "08xxxxxxxxxx",
    emailMismatchNotice1: "This email is different from your login account",
    emailMismatchNotice2: "The payment invoice will be sent to the email address you filled above.",
    voucherTitle: "Voucher/Referral Code (Optional)",
    voucherApplied: "Applied",
    voucherPlaceholder: "Enter voucher or referral code",
  },

  id: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Iklankan survey kamu ke 2 Juta responden Jakpat",

    // Step Navigation
    step1: "Detail Survey",

    // Step One - Survey Source Selection
    surveyDetails: "Detail Survey",
    chooseSurveySource: "Pilih sumber survey Anda",

    // Google Form Option
    googleFormOption: "Google Form",
    googleFormDescription: "Import pertanyaan dari Google Forms dengan akurasi 100%. Data otomatis terisi dari form Anda.",
    googleDriveAccess: "Akses ke Google Drive",

    // Other Source Option
    otherSourceOption: "Dari sumber lain",
    otherSourceDescription: "Masukkan URL Google Form atau isi data survey secara manual.",
    manualInputRequired: "Input manual diperlukan",

    // Google Drive Import
    importFromGoogleForms: "Import Pertanyaan dari Google Forms",
    backToSourceSelection: "← Kembali pilih sumber",
    connectToGoogleDrive: "Hubungkan ke Google Drive",
    searchGoogleForms: "Cari Google Forms",
    selectForm: "Pilih Form",
    importing: "Mengimport...",
    importSuccess: "Form berhasil diimport!",

    // GoogleDriveImport Component
    importQuestionsTitle: "Impor Pertanyaan dari Google Forms",
    accessGoogleDriveTitle: "Akses ke Google Drive",
    connectGoogleMessage: "Hubungkan akun Google kamu agar kami bisa mengakses file kamu.",
    agreeToGiveAccess: "Saya setuju untuk memberikan akses Google Drive kepada Jakpat berdasarkan",
    privacyPolicy: "Kebijakan Privasi",
    connect: "Hubungkan",
    connecting: "Menghubungkan...",
    connectedSuccessMessage: "Berhasil terhubung ke Google Drive",
    authenticationSuccessful: "Autentikasi berhasil",
    failedToConnect: "Gagal terhubung ke Google Drive",
    pleaseAcceptPrivacy: "Harap setujui kebijakan privasi terlebih dahulu",
    disconnectedSuccess: "Berhasil terputus dari Google Drive",
    failedToDisconnect: "Gagal memutus koneksi",
    searchAndImportForms: "Cari dan impor Google Forms",
    searchingForms: "Mencari Forms...",
    selectGoogleForm: "Pilih Google Form",
    fromYourDrive: "dari Drive Anda",
    willOpenPicker: "Akan membuka Google Picker untuk memilih form Anda",

    // Form Fields
    completeFormBelow: "Lengkapi form dibawah ini",
    googleFormLink: "Link Google Form",
    googleFormLinkPlaceholder: "https://docs.google.com/forms/...",
    googleFormLinkHelp: "Masukan link Google Form atau shortlink (forms.gle/abc) dan klik tombol \"Preview\" untuk mengisi field dibawah secara otomatis. Link selain Google Form bisa diisi secara manual.",

    surveyTitle: "Judul",
    surveyTitlePlaceholder: "Masukkan judul survey",
    surveyTitleFromGoogleDrive: "(dari Google Drive)",

    questionCount: "Jumlah Pertanyaan",
    questionCountPlaceholder: "Masukkan jumlah pertanyaan",

    surveyDescription: "Deskripsi Survey",
    surveyDescriptionPlaceholder: "Masukkan deskripsi survey",

    // Buttons
    preview: "Preview",
    loading: "Loading...",
    continue: "Lanjut",
    cancel: "Batal",
    save: "Simpan",
    cancelSubmission: "Batal",
    confirmCancelSubmission: "Apakah Anda yakin ingin membatalkan dan mulai dari awal? Ini akan menghapus draft Anda saat ini.",

    // Messages
    importedFromGoogle: "Diimport dari Google Drive",
    dataAutoFilled: "Data otomatis terisi dari Google Forms",

    // Validation
    required: "Field ini wajib diisi",
    invalidUrl: "Masukkan URL yang valid",

    // Footer
    footer: "Jakpat for Universities © 2025",

    // Total Cost
    totalCost: "Total Biaya",
    perQuestion: "pertanyaan x 1 (hari)",

    // Step Two Fields
    surveyDurationLabel: "Durasi survey iklan (hari)",
    surveyDurationPlaceholder: "Masukkan durasi dalam hari (1-30)",
    surveyDurationHelp: "Periode iklan akan dikonfirmasi oleh admin via WhatsApp setelah pembayaran",
    prizePerWinnerLabel: "Hadiah per-pemenang",
    prizePerWinnerPlaceholder: "Min. Rp 25.000",
    winnerCountLabel: "Jumlah Pemenang",
    winnerCountPlaceholder: "2-5 pemenang",
    incentiveDistributionInfo: "Jakpat akan mendistribusikan insentif ke responden secara otomatis",
    maxWinnerWarning: "Saat ini kami memprioritaskan survei dengan jumlah pemenang maksimal 5 orang. Untuk informasi lebih lanjut, silakan",
    contactAdmin: "hubungi admin",
    totalIncentiveRequired: "Total Insentif yang Dibutuhkan",
    recommendation: "Rekomendasi",
    perWinner: "/pemenang",
    respondentCriteriaPlaceholder: "Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif",
    respondentCriteriaLabel: "Kriteria Responden",
    respondentCriteriaHelp: "Kriteria responden ditampilkan pada iklan *hanya sebagai panduan*. Karena layanan ini mengiklankan survei ke *audiens berprofil random*, karakteristik responden yang mengisi dapat beragam.",

    // Step One Method Selection
    startByFillingData: "Mulai dengan mengisi data survei",
    chooseMethodSuitable: "Pilih metode yang paling sesuai untuk Anda.",
    importFromGoogleForm: "Import dari Google Form",
    manualFill: "Isi Manual",
    backButton: "Kembali",

    // Step Three - Slot Reservation
    slotReservationTitle: "Reservasi Slot Iklan",
    slotReservationInfo: "Pilih tanggal mulai iklan survei Anda. Iklan dengan jalur <strong>Auto-Approval</strong> akan langsung diproses tanpa review manual oleh admin.",
    slotStartDateLabel: "Tanggal Mulai Iklan",
    slotDurationLabel: "Durasi Iklan",
    slotFixedTimeTitle: "Iklan mulai tayang pukul 15.00 WIB",
    slotFixedTimeDesc: "Waktu tayang sudah ditetapkan secara otomatis untuk semua iklan.",
    slotErrorNoDate: "Silakan pilih tanggal mulai iklan Anda.",
    slotErrorFull: "Slot pada rentang tanggal yang dipilih sudah penuh (maksimal 3 antrean per hari). Silakan pilih tanggal lain.",
    slotErrorLoad: "Gagal memuat ketersediaan slot. Silakan coba lagi.",
    recommended: "RECOMMENDED",
    googleFormImportTitle: "Import dari Google Form",
    googleFormImportDescription: "Cara tercepat. Data terisi otomatis, harga langsung muncul, dan bisa langsung memulai survey.",
    benefit100Accurate: "100% Akurat (Auto-fill)",
    benefitAutoFill: "Langsung Bayar (Tanpa Review)",
    benefitSaveTime: "Langsung Set Jadwal Tayang",
    manualFillTitle: "Isi Manual",
    manualFillDescription: "Gunakan link dari platform lain (Typeform, Qualtrics, dll) atau jika Anda butuh pengaturan khusus.",
    fillManually: "Isi Secara Manual",
    canChangeMethodLater: "Anda dapat mengubah metode nanti jika diperlukan",
    requiresAdminReview: "Melalui proses verifikasi admin",
    byContinuingAgree: "Dengan melanjutkan, Anda setuju dengan",
    andText: "dan",
    termsConditions: "Syarat dan Ketentuan",
    noGoogleForm: "Tidak punya Google Form?",
    troubleFillingManual: "Ribet ngisi manual?",
    fillManualOnly: "Isi Manual Saja",

    // Validation Error Messages - StepOne
    errorEnterSurveyUrl: "Masukkan URL survei terlebih dahulu",
    errorSurveyTitleEmpty: "Judul survei tidak boleh kosong",
    errorSurveyDescriptionEmpty: "Deskripsi survei tidak boleh kosong",
    errorQuestionCountZero: "Jumlah pertanyaan harus lebih dari 0",

    // Validation Error Messages - StepOneFormFields
    errorSurveyLinkEmpty: "Link survey tidak boleh kosong",
    errorTitleEmpty: "Judul survey tidak boleh kosong",
    errorDescriptionEmpty: "Deskripsi survey tidak boleh kosong",
    errorQuestionCountInvalid: "Jumlah pertanyaan harus lebih dari 0",
    errorCompleteAllFields: "Mohon lengkapi semua field yang wajib diisi",

    // Step Four Sections
    surveyOverview: "Ringkasan Survey",
    promoCode: "Kode Promo (Opsional)",
    costBreakdown: "Rincian Biaya",

    // Review Items
    questions: "Pertanyaan",
    duration: "Durasi",
    incentive: "Insentif",
    targetCriteria: "Kriteria Target",
    contactInfo: "Info Kontak",

    // Promo Code
    voucherCodeLabel: "Kode Voucher/Referral",
    voucherCodePlaceholder: "Masukkan kode jika ada",
    voucherValid: "Voucher berhasil digunakan!",

    // Cost Breakdown
    adCampaignCost: "Biaya Kampanye Iklan",
    respondentIncentive: "Insentif Responden",
    subtotal: "Subtotal",
    discount: "Diskon",
    ppn: "PPN 11%",
    priceExcludesTax: "belum termasuk PPN 11%",
    totalPayment: "Total Pembayaran",
    totalIncludesTax: "Total sudah termasuk PPN 11%",
    disclaimer: "Dengan melanjutkan, Anda menyetujui Syarat Layanan dan Kebijakan Privasi kami",

    // Buttons
    proceedPayment: "Lanjut ke Pembayaran",
    submitForReview: "Kirim untuk Review Admin",

    // Payment Checkout Page
    checkoutTitle: "Selesaikan Pembayaran",
    checkoutSubtitle: "Slot survei Anda telah diamankan. Segera selesaikan pembayaran sebelum waktu habis.",
    checkoutTimerLabel: "Sisa waktu pembayaran",
    checkoutSchedule: "Jadwal",
    checkoutTotalLabel: "Total Bayar",
    checkoutPaymentInfo: "Pembayaran diproses dengan aman melalui DOKU. Metode yang tersedia: QRIS, Virtual Account, Credit Card.",
    checkoutPayNow: "Bayar Sekarang",
    checkoutProcessing: "Membuka pembayaran...",
    checkoutAlreadyPaid: "Sudah bayar? Cek status pembayaran",
    checkoutCheckingStatus: "Mengecek status...",
    checkoutExpiredTitle: "Slot Iklan Kedaluwarsa",
    checkoutExpiredDesc: "Waktu pembayaran Anda telah habis (1 jam). Slot jadwal survei Anda telah dilepaskan ke publik.",
    checkoutBackDashboard: "Kembali ke Dashboard",
    checkoutPickAgain: "Pilih Jadwal Ulang",
    checkoutPaidSuccess: "Pembayaran berhasil! Mengarahkan ke halaman status...",
    checkoutNotPaidYet: "Pembayaran belum diterima. Silakan selesaikan pembayaran terlebih dahulu.",
    checkoutCheckError: "Gagal mengecek status pembayaran. Coba lagi.",
    checkoutPaymentError: "Gagal membuka link pembayaran. Silahkan coba lagi.",
    days: "Hari",

    // Validation Error Messages - StepTwo
    errorRespondentCriteriaEmpty: "Kriteria responden tidak boleh kosong",
    errorSurveyDurationZero: "Durasi survei harus lebih dari 0 hari",
    errorWinnerCountRange: "Jumlah pemenang harus antara 2-5 orang",
    errorMinimumPrize: "Hadiah per pemenang minimal Rp 25.000",

    // Validation Error Messages - StepTwoConfig
    errorRespondentCriteriaRequired: "Kriteria responden tidak boleh kosong",
    errorDurationZero: "Durasi harus lebih dari 0 hari",
    errorDurationMax: "Durasi maksimal 30 hari",
    errorMinWinners: "Minimal 2 pemenang",
    errorMaxWinners: "Maksimal 5 pemenang",
    errorMinPrize: "Minimal Rp 25.000 per pemenang",
    errorFixFields: "Mohon perbaiki field yang bermasalah",

    // Validation Error Messages - Kontak invoice (StepCheckout)
    errorFullNameEmpty: "Nama lengkap tidak boleh kosong",
    errorEmailInvalid: "Format email tidak valid",
    errorPhoneMinLength: "Nomor telepon minimal 10 digit",

    // Validation Error Messages - StepFour
    errorCompleteAllSurveyData: "Mohon lengkapi semua data survey",
    errorSavingData: "Gagal menyimpan data. Silakan coba lagi.",
    errorPaymentFailed: "Gagal membuat pembayaran. Silakan coba lagi nanti.",
    errorSavingDataGeneric: "Terjadi kesalahan saat menyimpan data. Silakan coba lagi.",
    errorTermsRequired: "Mohon setujui Syarat & Ketentuan serta Kebijakan Privasi",

    // Success Messages - StepFour
    successFormSubmitted: "Form berhasil dikirim! Anda akan diarahkan ke halaman sukses.",
    successPaymentRedirect: "Berhasil! Anda akan diarahkan ke halaman pembayaran.",

    // Success Messages - GoogleDriveImportSimple
    successConnectedGoogleDrive: "Berhasil terhubung ke Google Drive",
    successFormImported: "Form \"{title}\" berhasil diimport",
    reviewSuccess: "Review berhasil",

    // Error Messages - GoogleDriveImportSimple
    errorConnectGoogleDrive: "Gagal terhubung ke Google Drive",
    errorConnectFirst: "Harap hubungkan ke Google Drive terlebih dahulu",
    errorExtractFormData: "Gagal mengekstrak data form",
    errorSelectForm: "Gagal memilih form",
    reviewingSystem: "Kuesioner sedang direview oleh sistem...",
    errorFormNotPublished: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorFormRestricted: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorInsufficientPermissionsTitle: "Izin Tidak Lengkap",
    errorInsufficientPermissionsDesc: "Mohon centang SEMUA kotak izin agar kami dapat membaca form Anda. Jangan khawatir, kami hanya membaca file yang Anda pilih.",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data berhasil diimport dari Google Drive",

    // Section Titles - StepOne
    surveyInformation: "Informasi Survey",
    surveyConfiguration: "Konfigurasi Iklan",
    incentiveSettings: "Pengaturan Insentif",
    surveyConfigurationDescription: "Tentukan kriteria responden dan insentif untuk survey Anda",

    // Section Titles - StepThree
    personalData: "Data diri",

    // Section Titles - StepFour
    reviewAndPayment: "Review & Pembayaran",

    // Personal Data Warning Modal
    personalDataWarningTitle: "Tunggu! Ada Pertanyaan Data Pribadi",
    personalDataWarningSubtitle: "Sistem mendeteksi pertanyaan yang mungkin mengumpulkan data sensitif",
    personalDataDetectedLabel: "Pertanyaan yang terdeteksi:",
    personalDataPolicyExplanation: "Pengumpulan data berikut ini dibatasi:",
    personalDataExample1: "Kontak Pribadi (Email/HP/WhatsApp)",
    personalDataExample2: "Nama Lengkap (sesuai KTP) / NIK",
    personalDataExample3: "Alamat Rumah / Lokasi Detail",
    personalDataExample4: "File Upload (Foto/Dokumen)",
    personalDataWhatHappens: "💡 Mengapa ini dibatasi?",
    personalDataWhatHappensDetail: "Pengumpulan data ini berisiko melanggar privasi (UU PDP) dan transaksi di luar platform. Namun, jika data ini krusial untuk riset Anda (misal: rekrutmen user), kami bisa menyetujuinya setelah review manual.",
    readTermsConditions: "Baca Syarat & Ketentuan",
    personalDataContinueButton: "Saya Mengerti, Lanjut Review Manual",
    personalDataCancelButton: "Kembali & Edit Form",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Gagal terhubung ke server. Periksa koneksi internet Anda.",

    // Google Drive Connect Steps
    googleConnectTitle: "Hubungkan Google Account",
    googleConnectDescription: "Kami memerlukan akses read-only ke Google Drive dan Google Forms Anda",
    permissionDrive: "Google Drive (read only)",
    permissionForms: "Google Forms (read only)",
    googleConnectButton: "Hubungkan dengan Google",
    googleConnectedTitle: "Terhubung ke Google Drive",
    googleConnectedMessage: "Akun Google Anda berhasil terhubung",
    titleSelectForm: "Pilih Survey Anda",
    descriptionSelectForm: "Tentukan file Google Form yang ingin diiklankan dari Google Drive.",
    buttonSelectForm: "Cari File di Drive",

    // Status Page
    pageTitle: "Track Status",
    pageSubtitle: "Pantau progress submission survey Anda secara real-time.",
    statusAll: "Semua Status",
    statusInReview: "Under Review",
    statusWaitingPayment: "Awaiting Payment",
    statusScheduling: "Slot Reserved",
    statusScheduled: "Scheduled",
    statusPublishing: "Ready to Launch",
    statusCompleted: "Completed 🎉",
    statusInReviewHelper: "Survei Anda sedang ditinjau oleh tim kami.",
    statusInReviewCompletedHelper: "Survei Anda telah ditinjau.",
    statusPaymentHelper: "Menunggu pembayaran Anda untuk diproses.",
    statusPaymentSuccessHelper: "Pembayaran diterima dan dikonfirmasi.",
    statusSchedulingHelper: "Jadwal penayangan sedang disusun Admin.",
    statusSchedulingCompletedHelper: "Slot Anda berhasil dipesan.",
    statusScheduledHelper: "Menunggu Tanggal Tayang",
    statusPublishingHelper: "Iklan Anda sedang disiapkan",
    statusPublishingLiveHelper: "Iklan survei Anda sedang tayang! 🚀",
    statusPublishingCompletedHelper: "Iklan sudah berakhir.",
    statusCompletedHelper: "Iklan Anda telah berhasil diselesaikan.",
    chooseSchedule: "Pilih Jadwal",
    rescheduleSlot: "Jadwalkan Ulang",
    statusLiveUntil: "Tayang hingga",
    statusAwaitingInvoiceHelper: "Menunggu admin menerbitkan tagihan. Link pembayaran akan segera tersedia.",
    payNow: "Bayar Sekarang",
    contactSupport: "Butuh bantuan? Hubungi Support",
    downloadReceipt: "Unduh Bukti Pembayaran",
    viewInvoice: "Lihat Invoice",
    airingPeriods: "Periode Tayang",
    airingOriginal: "Asli",
    extendHistory: "Riwayat Perpanjangan Durasi",
    payExtension: "Bayar Perpanjangan",
    extendedLabel: "Diperpanjang",
    extendWaitingPaymentAlertTitle: "Perpanjangan Durasi Menunggu Pembayaran",
    extendWaitingPaymentAlert: "Admin telah menyetujui perpanjangan durasi survei Anda. Selesaikan pembayaran agar perpanjangan dapat dijadwalkan dan ditayangkan.",
    extendExpiredHint: "Link pembayaran perpanjangan ini telah kedaluwarsa. Silakan jadwalkan ulang perpanjangan melalui admin / Hubungi Support.",
    extStatusWaitingPayment: "Menunggu Pembayaran",
    extStatusPaid: "Lunas",
    extStatusScheduled: "Terjadwal",
    extStatusLive: "Tayang",
    extStatusCompleted: "Selesai",
    extStatusCancelled: "Dibatalkan",
    extStatusExpired: "Kedaluwarsa",
    noSubmissions: "Belum ada submission",
    createFirstSurvey: "Buat Survey Baru",
    noSubmissionsDesc: "Anda belum mengajukan survey apapun. Buat survey pertama Anda untuk memulai.",
    submittedOn: "Diajukan pada",
    adDuration: "Durasi Iklan",

    winner: "pemenang",

    // Revision / Spam Status
    statusRevisionNeeded: "Perlu Revisi",
    revisionNeededTitle: "Mohon Submit Ulang",
    revisionNeededDescPart1: "Terdapat kendala saat proses review, seperti tautan yang belum dapat diakses atau informasi yang belum sesuai dengan",
    revisionNeededDescPart2: " kami. Silakan perbarui data yang diperlukan dan submit ulang survei Anda.",
    resubmit: "Submit Ulang",
    delete: "Hapus",
    deleteSubmissionConfirm: "Apakah Anda yakin ingin menghapus submission ini? Data yang dihapus tidak dapat dikembalikan.",
    deleteSubmissionSuccess: "Submission berhasil dihapus",
    deleteSubmissionError: "Gagal menghapus submission",

    // JFU Kilat
    kilatUpgradeTitle: 'Upgrade ke JFU Kilat!',
    kilatUpgradeTagline: 'Hasil iklan selama 2 hari bisa selesai dalam 2 jam saja!',
    kilatUpgradeDesc: 'Distribusi super cepat via platform khusus.',
    kilatBenefitNoPage: 'Push notifikasi langsung ke responden',
    kilatBenefitFast: 'Pengumpulan responden ~2 jam',
    kilatBenefitPrice: 'Harga: Base rate + Rp 200.000',
    kilatUpgradeButton: 'Upgrade ke JFU Kilat ⚡',
    statusKilatSlot: 'Jadwal Kilat',
    statusKilatSlotHelper: 'Jadwal Mulai Distribusi',
    statusKilatSlotCompletedHelper: 'Jadwal Terkonfirmasi',
    statusKilatPublishing: 'Distribusi Kilat',
    statusKilatPublishingHelper: 'Proses distribusi',
    statusKilatPublishingLiveHelper: 'Sedang didistribusikan',
    statusKilatPublishingCompletedHelper: 'Distribusi selesai',
    kilatModeActive: 'Mode JFU Kilat Aktif',
    kilatScheduleTitle: 'Pilih Jadwal Distribusi Kilat',
    kilatDuration: '~2 jam (Kilat ⚡)',
    kilatAddonLabel: 'Add-on JFU Kilat',
    kilatUndoButton: 'Kembali ke Iklan Regular',
    kilatBackToRegular: 'Kembali ke Regular',
    orderOverviewTitle: 'Ringkasan Pesanan',
    surveyAndTarget: 'Survei & Target',
    questionsAndDuration: 'Pertanyaan & Durasi',
    respondentIncentiveLabel: 'Insentif Responden',
    releaseSchedule: 'Jadwal Rilis',
    ordererData: 'Info Pemesan',
    institutionAndProfile: 'Institusi & Profil',

    // Profile Page
    profileCompleteTitle: "Lengkapi Profil Anda",
    profileTitle: "Profil Researcher",
    onboardingDesc: "Sebelum memasang survei, lengkapi biodata researcher Anda terlebih dahulu. Cukup sekali — order berikutnya tidak akan menanyakannya lagi.",
    profileDesc: "Biodata ini dipakai sebagai identitas researcher dan default detail invoice di setiap order.",
    makeResearchEasier: "Biar risetmu makin gampang! 🚀",
    profilePageCalloutText: "Lengkapi profilmu yuk! Ini akan membantu kami memberikan layanan yang lebih baik sesuai kebutuhanmu.",
    invoiceDetailsChangeable: "Tenang aja, detail invoice tetap bisa diubah bebas kok pas checkout!",
    profilePersonalData: "Data Diri",
    fullName: "Nama Lengkap",
    fullNamePlaceholder: "Nama lengkap Anda",
    phoneNumber: "No Telepon",
    academicInfo: "Informasi Akademik",
    university: "Universitas",
    universityPlaceholder: "Ketik atau pilih universitas",
    department: "Jurusan",
    departmentPlaceholder: "Ketik atau pilih jurusan",
    academicStatus: "Status Akademik",
    academicStatusPlaceholder: "Pilih status akademik Anda saat ini",
    referralTitle: "Dari Mana Anda Mengetahui Kami?",
    referralPlaceholder: "Pilih salah satu",
    referralSourceOtherPlaceholder: "Sebutkan sumbernya",
    saveAndContinue: "Simpan & Lanjut Pasang Survei →",
    saveProfile: "Simpan Profil",
    profileSaveSuccess: "Profil berhasil disimpan",
    profileSaveFailed: "Gagal menyimpan profil",
    fillRequiredFields: "Mohon lengkapi semua kolom wajib dengan benar",

    // Validation Errors
    errFullNameRequired: "Nama lengkap wajib diisi",
    errPhoneNumberRequired: "Nomor telepon wajib diisi",
    errPhoneNumberMin: "Nomor telepon minimal 10 digit",
    errUniversityRequired: "Universitas wajib diisi",
    errDepartmentRequired: "Jurusan wajib diisi",
    errAcademicStatusRequired: "Status akademik wajib diisi",
    errReferralRequired: "Sumber informasi wajib dipilih",
    errReferralOtherRequired: "Mohon sebutkan sumber informasi Anda",

    // Academic Status Options
    academicStatusDosen: "👨‍🏫 Dosen",
    academicStatusS3: "🎓 Mahasiswa S3 (Doktor)",
    academicStatusS2: "🎓 Mahasiswa S2 (Master)",
    academicStatusS1: "🎓 Mahasiswa S1 (Sarjana)",
    academicStatusD3: "🎓 Mahasiswa D3 (Diploma)",
    academicStatusSMA: "📚 Pelajar SMA/SMK",

    // Referral Options
    referralTiktok: "TikTok",
    referralInstagram: "Instagram",
    referralLinkedIn: "LinkedIn",
    referralWebsiteJakpat: "Website Jakpat",
    referralBlogJakpat: "Blog Jakpat",
    referralGoogleSearch: "Google Search",
    referralChatGPT: "ChatGPT",
    referralRekomendasiDosen: "Rekomendasi Dosen",
    referralRekomendasiTeman: "Rekomendasi Teman",
    referralLainnya: "Lainnya",

    // Invoice Details & Voucher
    invoiceDetailTitle: "Detail Invoice",
    sameAsAccount: "Sama dengan data akun",
    invoiceContactHelp: "Invoice dan notifikasi pembayaran order ini akan dikirim ke kontak berikut.",
    invoiceNameLabel: "Nama Lengkap",
    invoiceNamePlaceholder: "Nama sesuai KTP",
    invoiceEmailLabel: "Email Invoice",
    invoiceEmailPlaceholder: "email@contoh.com",
    invoicePhoneLabel: "No Telepon",
    invoicePhonePlaceholder: "08xxxxxxxxxx",
    emailMismatchNotice1: "Email ini berbeda dari akun login Anda",
    emailMismatchNotice2: "Invoice pembayaran akan dikirim ke email yang Anda isi di atas.",
    voucherTitle: "Kode Voucher/Referral (Optional)",
    voucherApplied: "Digunakan",
    voucherPlaceholder: "Masukkan kode voucher atau referral",
  }
};

export type TranslationKey = keyof typeof translations.en;

/**
 * Compile-time guard — DO NOT REMOVE.
 *
 * `satisfies` forces `translations.id` to define a string for every key in `en`.
 * Add a key to `en` and forget it in `id` and `tsc` fails here, naming the
 * missing key — instead of `t()` silently returning the raw key string at
 * runtime (see LanguageContext `t`). The default language is `id`, so such a
 * miss would hit the primary audience. Note: `vite build` does not typecheck —
 * run `tsc -b` (or your IDE / CI) to surface this error.
 */
void (translations.id satisfies Record<TranslationKey, string>);
