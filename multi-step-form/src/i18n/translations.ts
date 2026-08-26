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
    googleConnectDescription: "Read-only access to your Google Drive and Google Forms only",
    permissionDrive: "Google Drive (read only)",
    permissionForms: "Google Forms (read only)",
    googleConnectButton: "Connect with Google",
    googleConnectedTitle: "Connected to Google Drive",
    googleConnectedMessage: "Your Google Account has been successfully connected",
    titleSelectForm: "Select Google Form",
    descriptionSelectForm: "Choose the Google Form file you want to advertise from your Google Drive.",
    buttonSelectForm: "Find File in Drive",
    connectedAsEmail: "Connected as {email}",
    changeGoogleAccount: "Change Account",
    changeSelectedForm: "Change Form",
    selectedSurveyTitle: "Survey review completed",
    surveyRejectedTitle: "Questionnaire rejected",
    questionsCountSuffix: "Questions",
    noSensitiveKeywords: "No sensitive keywords",
    sensitiveKeywordsDetected: "Sensitive keywords detected",
    statusReadyToAdvertise: "Questionnaire ready for advertising",
    statusDetectedIssue: "Issue detected",
    statusDetectedSensitive: "Sensitive questions detected",
    personalDataReasonNote: "Sensitive questions detected: {keywords}. Per Terms & Conditions, questionnaires with personal data require admin review.",
    technicalIssueReasonNote: "Your Google Form is restricted, unpublished, or not accepting responses.",
    googleSafetyToggle: "Your data is safe!",
    googleSafetyPoint1: "We can't see other files in your Drive",
    googleSafetyPoint2: "The system only reads the one file you pick",
    googleSafetyPoint3: "Access is limited to reading question types and total question count",

    // Status Page
    pageTitle: "My Orders",
    pageSubtitle: "Monitor the progress of your survey submissions in real-time.",
    statusAll: "All Status",
    statusInReview: "Under Review",
    statusWaitingPayment: "Awaiting Payment",
    statusScheduling: "Slot Reserved",
    statusScheduled: "Scheduled",
    statusPublishing: "Ready to Launch",
    statusCompleted: "Completed 🎉",
    // ⚠️ "Pilih Jadwal" DIBUANG dari sisi peneliti. Admin memakai kata yang
    // sama persis untuk aksinya sendiri ("Tentukan Jadwal"/"Ganti Tanggal"),
    // jadi dua pihak sama-sama mengira langkah itu miliknya. Yang dipilih
    // peneliti adalah TANGGAL; jadwal adalah bendanya, bukan aksinya.
    chooseSchedule: "Pick a date",
    rescheduleSlot: "Pick a new date",
    payNow: "Pay Now",
    contactSupport: "Need help? Contact Support",
    downloadReceipt: "Download Receipt",
    airingPeriodLabel: "Ad Schedule",
    incentiveNewPeriod: "New period",
    incentiveAccumulated: "added to the previous incentive pool",
    periodBatchLabel: "Lottery Period",
    airingDateLabel: "Reservation Date",
    scheduleExpiredHint: "The payment link for this schedule has expired. Our team will issue a replacement — chat with Mimin below if you need it sooner.",
    extStatusWaitingPayment: "Awaiting Payment",
    extStatusPaid: "Paid",
    extStatusScheduled: "Scheduled",
    extStatusLive: "Live",
    extStatusCompleted: "Completed",
    extStatusCancelled: "Cancelled",
    extStatusExpired: "Expired",
    noSubmissions: "No submissions yet",
    createFirstSurvey: "Create New Survey",
    noSubmissionsDesc: "You haven't submitted any survey for distribution yet. Choose an option below to start distributing your survey to Jakpat respondents.",
    submittedOn: "Submitted on",
    days: "Days",

    winner: "winner",

    // Form Fields
    completeFormBelow: "Complete the form below",
    googleFormLink: "Google Form Link",
    googleFormLinkPlaceholder: "https://docs.google.com/forms/...",
    surveyLinkLabel: "Survey Link",
    surveyLinkPlaceholder: "https://forms.gle/... or your survey URL",

    surveyTitle: "Survey Title",
    surveyTitlePlaceholder: "Enter survey title",
    surveyTitleFromGoogleDrive: "(from Google Drive)",

    questionCount: "Questions",
    questionCountPlaceholder: "12",

    surveyDescription: "Survey Description",
    surveyDescriptionPlaceholder: "Enter survey description",

    // Buttons
    preview: "Preview",
    loading: "Loading...",
    continue: "Continue",
    cancel: "Cancel",
    save: "Save",

    // Messages
    importedFromGoogle: "Imported from Google Drive",
    dataAutoFilled: "Data automatically filled from Google Forms",

    // Validation
    required: "This field is required",
    invalidUrl: "Please enter a valid URL",

    // Footer
    footer: "Jakpat for Universities © 2025",

    // Total Cost
    perQuestion: "questions x 1 (day)",

    // Step Two Fields
    surveyDurationLabel: "Ad Duration",
    surveyDurationPlaceholder: "Enter duration in days (1-30)",
    surveyDurationHelp: "Ad period will be confirmed by admin via WhatsApp after payment",
    prizePerWinnerLabel: "Prize per winner",
    prizePerWinnerPlaceholder: "Min. Rp 25,000",
    winnerCountLabel: "Number of Winners",
    winnerCountPlaceholder: "2-5 winners",
    incentiveDistributionInfo: "Jakpat will distribute rewards to respondents automatically",
    maxWinnerWarning: "Currently, we prioritize surveys with a maximum of 5 winners. For more information, please",
    contactAdmin: "contact admin",
    totalIncentiveRequired: "Total Reward Required",
    recommendation: "Recommendation",
    perWinner: "/winner",
    respondentCriteriaPlaceholder: "Example: Age 18-35 years, Jakarta Domicile, Active Student",
    respondentCriteriaLabel: "Respondent Criteria",
    respondentCriteriaHelp: "Respondent criteria on ads are only used as a *guide for prize draws*. Surveys are still distributed to a *randomly profiled audience*, so the respondents who complete them will be *diverse*.",


    // Step One Method Selection
    importFromGoogleForm: "Import from Google Form",
    manualFill: "Fill Manually",
    backButton: "Back",

    // Schedule picker (see the "Order flow" block below for the screen copy)
    slotClosedTodayLabel: "Closed",
    slotErrorPastCutoff: "Today's booking cut-off (13:00 WIB) has passed. Please choose another date.",
    slotErrorNoDate: "Please select a start date for your ad.",
    slotErrorFull: "Slots for the selected date range are full (max 3 per day). Please choose a different date.",
    slotErrorAvailabilityUnknown: "We could not load slot availability, so we cannot lock this date yet. Please retry.",
    slotAvailabilityRetry: "Retry loading availability",
    googleFormImportTitle: "Import from Google Form",
    manualFillTitle: "Fill Manually",
    fillManually: "Fill Manually",
    canChangeMethodLater: "You can change the method later if needed",
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
    errorInvalidSurveyUrl: "Invalid survey URL. Must start with http:// or https://",
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

    // Payment Checkout Page
    checkoutTotalLabel: "Total Payment",
    checkoutPaymentInfo: "Payment is processed securely via DOKU. Available methods: QRIS, Virtual Account, Credit Card.",
    checkoutPayNow: "Pay Now",
    checkoutProcessing: "Opening payment...",
    checkoutAlreadyPaid: "Already paid? Check payment status",
    checkoutCheckingStatus: "Checking status...",
    checkoutPaidSuccess: "Payment confirmed! Redirecting to status page...",
    checkoutNotPaidYet: "Payment not received yet. Please complete your payment first.",
    checkoutCheckError: "Failed to check payment status. Please try again.",
    checkoutPaymentError: "Failed to open payment link. Please try again.",

    // ─── Order flow: Details → Summary → Schedule & Payment → Success ───
    // Prinsipnya: tiap layar ditutup dengan menyebut apa yang terjadi
    // berikutnya, dan dibuka dengan menegaskan apa yang barusan selesai.

    // Step 1 — Survey Details
    surveyDurationHint: "Ads on JFU have historically reached around 200 respondents per airing day. That is a look back at past ads, not a promise — results differ with your topic and respondent criteria.",
    prizePerWinnerHint: "This prize is raffled among respondents who complete your survey. It exists to lift willingness to answer, so longer surveys usually need a bigger prize.",
    slotOutlook: "At {days}, {open} of the next 14 days are still open as a start date.",
    slotOutlookNone: "At {days}, none of the next 14 days can fit a run right now. Try a shorter duration.",
    continueToSummary: "Continue to Payment Details",

    // Step 2 — Summary
    summaryTitle: "Review your order",
    summarySubtitle: "Nothing is charged at this step — you can still go back and change your survey details.",
    summaryCtaSchedule: "Choose Airing Date",
    summaryCtaPay: "Lock Schedule & Pay",
    summaryCtaReview: "Send for Review",
    summaryHintSchedule: "Next you pick the airing date, then complete the payment.",
    summaryHintPay: "Your airing date is already picked — next you complete the payment.",
    summaryHintReview: "Our team reviews your survey within 2 working days. We'll email you as soon as the invoice is ready — nothing is charged now.",
    processing: "Processing...",
    voucherManualVerifyTitle: "This voucher needs verifying first",
    voucherManualVerifyBody1: "Voucher",
    voucherManualVerifyBody2: "has to be verified by our team first. That is why your order goes into the review queue (max 2 working days) and the airing date is picked after verification is done, not now. Nothing is charged at this step.",

    // Step 3 — Schedule (phase A)
    scheduleTitle: "Choose when your ad airs",
    scheduleSubtitle: "Your ad starts airing at 15:00 WIB on your selected date.",
    scheduleCutoffNote: "Bookings for today close at 13:00 WIB.",
    scheduleLockCta: "Lock Schedule & Pay",
    scheduleConfirmKilatCta: "Use This Kilat Date",
    scheduleHoldHint: "The slot is held for 1 hour after you lock it, so you have time to complete the payment.",
    scheduleKilatHint: "You'll confirm the order summary once more before paying.",
    scheduleEstimatedTitle: "Estimated Airing Schedule",
    airingStartsAt: "Starts 15:00 WIB",
    airingDurationBadge: "Airing for {days}",
    lockingSlotLoading: "Locking your slot...",
    sendingForReviewLoading: "Sending your survey...",
    slotLockedSuccess: "Slot locked. Complete the payment to keep it.",

    // Phase B — countdown on the payment page
    paymentPhaseTitle: "Complete your payment",
    paymentPhaseSubtitle: "Pay before the time runs out to secure your airing slot.",
    timerLabelHold: "Time left:",
    timerLabelCutoff: "Today's payment cut-off (14:00 WIB) — time left",
    timerConsequenceNote: "If the time runs out, the slot is released to other advertisers. Your survey details stay saved.",
    // Jadwal yang dibuat admin tidak punya umur — lihat utils/slotHold.ts.
    slotHeldByAdminLabel: "Slot held for you by our team",
    slotHeldByAdminNote: "This slot has no countdown — it is not released automatically. Our team will confirm the schedule with you.",
    // Batas 14.00 WIB lewat, tapi slotnya TIDAK dilepas.
    paymentPastCutoffTitle: "That date can no longer be met",
    paymentPastCutoffBody: "The 14:00 WIB payment cut-off for that date has passed, so the ad cannot go live then. Your slot has not been released — you can still pay, and our team will confirm the new airing date with you.",
    paymentExpiredTitle: "Payment time is up",
    paymentExpiredHoldBody: "The slot has been released to other advertisers. Your survey details are still saved — just pick another date below.",
    paymentExpiredCutoffBody: "The 14:00 WIB payment cut-off for that date has passed, so the ad can no longer go live then. Your survey details are still saved — just pick another date below.",
    rebookPickTitle: "Pick another airing date",
    rebookCta: "Lock New Schedule",
    rebookSuccess: "New schedule locked. Complete the payment before the timer runs out.",
    rebookError: "Failed to lock the new schedule. Please try again.",
    paymentSubmissionNotFound: "Order not found.",
    paymentLoadError: "Failed to load payment details.",

    // Success page after DOKU
    successPaidTitle: "Payment received",
    successPaidBody: "Your survey ad “{title}” airs on {start} at 15:00 WIB, and runs for {days} until {end}.",
    successPaidBodyNoSchedule: "Payment for “{title}” is confirmed. We'll set the airing date shortly and it will show up in My Orders.",
    successFollowUp: "You can follow its progress any time in My Orders.",
    successPendingTitle: "Confirming your payment",
    successPendingBody: "If you have just completed the payment, the bank's confirmation usually lands within a few minutes. This page refreshes itself — no need to close it.",
    successTxDetails: "Transaction details",
    successAiringLabel: "Airing schedule",
    successOrderIdLabel: "Order ID",
    successNoScheduleYet: "Not set yet",
    successBadgePaid: "Paid",
    successBadgePending: "Awaiting",
    successViewOrders: "View My Orders",
    successCheckNow: "Check status now",
    successChecking: "Checking...",
    successContactSupport: "Contact Support",
    successCloseTab: "Close this tab",
    successNotFound: "Order data not found",
    successLoadErrorTitle: "Something went wrong",
    successLoadError: "Failed to load order data.",

    // Validation errors raised while writing the order
    errorNoScheduleSelected: "Please pick an airing date first.",
    errorSlotFullKilat: "Kilat slots for that date are full. Please pick another date.",
    errorSlotFullRange: "Slots in that date range are full. Please pick another date.",
    errorAvailabilityCheck: "Failed to check slot availability. Please try again.",

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
    autoReviewCheckQuestions: "Reading questions",
    autoReviewCheckPersonalData: "Checking for personal data",
    autoReviewCheckSummary: "Preparing summary",
    errorFormNotPublished: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorFormRestricted: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorInsufficientPermissionsTitle: "Insufficient Permissions",
    errorInsufficientPermissionsDesc: "Please check ALL permission boxes so we can review your form. Don't worry, we only read the file you select.",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data successfully reviewed and imported into the system",

    // Section Titles - StepOne
    surveyInformation: "Survey Information",
    surveyConfiguration: "Ad Configuration",
    incentiveSettings: "Reward Settings",
    surveyConfigurationDescription: "Define respondent criteria and rewards for your survey",

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
    personalDataContinueButton: "I Understand, Continue to Admin Review",
    personalDataCancelButton: "Back to Edit Form",
    personalDataInlineNotePart1: "Per our",
    personalDataInlineNotePart2: ", this form will require Admin Review.",
    personalDataRemoveHint: "Please remove the personal data questions from your Google Form, then import again.",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Failed to connect to server. Please check your internet connection.",

    // Revision / Spam Status
    revisionNeededTitle: "Awaiting Revision",
    revisionNeededDescPart1: "There are issues during the review process, such as inaccessible links or information that does not comply with our",
    revisionNeededDescPart2: ". Please update the necessary data and resubmit your survey.",
    resubmit: "Resubmit",
    delete: "Delete",
    // Menyingkirkan order yang ditolak. Copy lama ("cannot be recovered") sengaja
    // dibuang: order-nya kini disimpan, bukan dihapus, jadi janji itu tak lagi benar.
    dismissSubmissionTitle: "Remove this order from your list?",
    dismissSubmissionDescPart1: "The order",
    dismissSubmissionDescPart2: "will disappear from your list. We keep the record, so our team can still look it up if you need help with it.",
    dismissSubmissionConfirm: "Remove from list",
    dismissSubmissionLoading: "Removing…",
    untitledSurvey: "this survey",
    deleteSubmissionSuccess: "Order removed from your list",
    deleteSubmissionError: "Failed to remove the order",

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
    respondentIncentiveLabel: 'Respondent Reward',
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

    // Dashboard revamp — navigation
    navOrders: "My Orders",
    navMyOrder: "My Order",
    navTheForm: "Form Builder",
    navChatMimin: "Chat Mimin",
    navCreateOrder: "New Order",
    navHelp: "Help",
    navProfile: "Profile",
    signOut: "Sign Out",
    backToOrders: "Back to My Orders",
    refresh: "Refresh",
    language: "Language",

    // Dashboard revamp — homepage product hub
    createNewOrder: "Create New Order",
    comingSoon: "Coming Soon",
    productAdsTitle: "Survey Ads",
    productAdsHook: "For maximum reach —",
    productAdsDesc: "Air your survey to thousands of active respondents in the Jakpat app.",
    productKilatTitle: "Kilat",
    productKilatHook: "For maximum speed —",
    productKilatDesc: "Express distribution via push notification to active Jakpat respondents.",
    productRespAccessTitle: "Respondent Access",
    productRespAccessHook: "For precise targeting —",
    productRespAccessDesc: "Direct access to respondents for your research",
    productMissionTitle: "Special Mission & Tasks",
    productMissionHook: "For real-world actions —",
    productMissionDesc: "Mystery shopping, website & app testing, and product sample tasting.",

    // Product entry pages (submit-iklan & submit-kilat)
    adsEntryHeroDesc: "We air your survey to thousands of active respondents in the Jakpat app — you decide how long it runs.",
    adsEntryMethodQuestion: "Before your survey is published",
    adsEntryAutoRowSources: "Google Forms & Microsoft Forms",
    adsEntryAutoRowHighlight: "Instant ad schedule reservation",
    adsEntryAutoRowTime: "Done in seconds",
    adsEntryManualRowDesc: "Typeform, Qualtrics, or manual survey",
    adsEntryManualRowHighlight: "Reservation after review completes",
    adsEntryManualRowTime: "Estimated max 2 working days",
    adsEntryReviewNotePart1: "Before publishing, we perform technical reviews to ensure your survey renders well on the Jakpat platform and complies with our",
    adsEntryReviewNotePart2: ".",
    // CTA JFU Form di bawah pilihan metode
    jfuFormCtaLead: "Don't have a questionnaire yet?",
    jfuFormCtaAction: "try creating your questionnaire with JFU Forms. Free",
    jfuFormPromoLead: "New survey to build? Try JFU Form",
    jfuFormPromoFree: "Free",
    jfuFormPromoProp1: "an alternative to Qualtrics & SurveyMonkey",
    jfuFormPromoProp2: "just chat, and AI drafts the questions",
    jfuFormPromoProp3: "surveys that skip ahead based on the answers",
    msFormsImportTitle: "Microsoft Forms",
    kilatFactPush: "Express distribution via push notification in the Jakpat app",
    kilatFactFast: "Results start coming in within hours",
    kilatFactOneDay: "Airs for one full day",
    kilatFactPrice: "Base rate + {price} add-on",
    kilatComingSoonNote: "Kilat is not open for direct orders yet. In the meantime, reach your respondents with Survey Ads.",
    kilatStartWithAds: "Start with Survey Ads",
    profileSheetTitle: "Complete your profile first",
    profileSheetDesc: "One time only — your order and invoice details are taken from this profile.",

    // Dashboard revamp — order list & filters
    filterAll: "All",
    filterNeedsAction: "Action Needed",
    filterOngoing: "In Progress",
    filterDone: "Done",
    noOrdersInFilter: "No orders in this category.",
    noOrdersTitle: "No orders yet",
    createFirstOrder: "Create Your First Order",
    chatAboutOrder: "Ask Mimin",

    // Dashboard revamp — next-step callout
    calloutReviewManual: "Your survey is being reviewed by our admin — max 2 working days (Mon–Fri). We'll notify you by email.",
    calloutDetectedKeywords: "Detected:",
    calloutChooseSchedule: "Your survey is approved! Pick an airing schedule to continue.",
    calloutPayBefore: "Complete your payment before",
    calloutPayBeforeSuffix: "or the slot will be released.",
    calloutPayBeforeSuffixCutoff: "so your ad can go live on the scheduled date.",
    calloutPaymentGeneric: "Complete your payment to secure your survey's airing schedule.",
    calloutExpired: "Payment expired and the slot was released. Pick a new schedule — no need to resubmit.",
    calloutTooLateToday: "Payment for today's schedule passed the 14:00 WIB cut-off, so the ad can no longer go live today. Pick a new schedule — no need to resubmit.",
    paymentQuotaPriorityNote: "Daily airing quota is limited, so we prioritise publishing in the order payments arrive. To secure the schedule you want, we recommend paying before that day's quota fills up 🙏",
    calloutReadyPrefix: "Payment received ✓. Your survey airs starting",
    calloutLivePrefix: "Your survey is live until",
    respondentExpectation: "JFU advertises your survey to Jakpat respondents — the number of responses depends on respondent interest and is not guaranteed.",
    calloutCompletedPrefix: "Airing period ended on",
    calloutCompletedSuffix: "Thank you for using JFU!",

    // Dashboard revamp — survey details & order info accordions
    copyOrderId: "Copy booking ID",
    orderIdCopied: "Booking ID copied to clipboard",
    scheduleAdAgain: "Schedule Ad Again",
    scheduleAgainComingSoon: "Booking another ad schedule is coming soon!",
    comingSoonBadge: "Coming Soon",
    adDuration: "Ad duration",
    totalCost: "Total cost",
    questionsUnit: "questions",
    detailPrize: "Winner incentive",

    // Order card v3 — phase ① Review
    phaseReviewTitle: "Review",
    // "Awaiting Revision", not "Rejected": the decision is NOT final — an admin
    // can still approve it the moment the researcher fixes the questionnaire,
    // without the researcher having to click anything first.
    reviewChipRejected: "Awaiting Revision",
    reviewChipPending: "In Review",
    reviewChipApproved: "Approved",
    reviewChipCancelled: "Cancelled",
    reviewTitleRejected: "Questionnaire Awaiting Revision",
    reviewSubRejected: "Your questionnaire needs a few fixes before we can process it further. This is not a rejection — once you're done, we'll review it again.",
    reviewTitleCancelled: "Order Cancelled",
    cancelledByResearcher: "You cancelled this order",
    cancelledByAdmin: "Cancelled by the Jakpat team",
    cancelledStaleInvoiceWarning: "Any invoice already issued no longer applies. Please don't pay a payment link you may have received.",
    cancelledNextStep: "This order will not go live. If you still want to advertise this survey, please create a new order.",
    btnCancelOrder: "Cancel Order",
    cancelOrderConfirmTitle: "Cancel this order?",
    cancelOrderConfirmBody: "The order stops here and will not go live. Any reserved slot is released, and an invoice already issued stops being valid. It stays visible under \"Done\" so you can still see what happened.",
    cancelOrderConfirmAction: "Yes, cancel order",
    cancelOrderSuccess: "Order cancelled.",
    cancelOrderError: "Could not cancel the order. Please try again.",
    reviewerNotesTitle: "Notes from Review Team",
    reviewGuideText: "Please update your questionnaire, then submit your confirmation below:",
    btnConfirmFixed: "I Have Fixed the Questionnaire",
    btnChangeLink: "Change Form Link",
    // Named after the nav label the researcher actually sees ("My Order"),
    // not a new word. It removes the card from the list; it deletes nothing.
    btnDeleteForm: "Remove from My Orders",
    submittingReReview: "Submitting...",
    // Label chip = SUMBER form; hint = SIAPA yang mereview. Dua fakta berbeda
    // yang dulu dipadatkan jadi satu kalimat ("Auto Review - Google Form").
    reviewMethodAuto: "Google Forms",
    reviewMethodManual: "Manual Review",
    reviewMethodAutoHint: "Automatic Review",
    reviewMethodManualHint: "Manual Review",
    openLinkInNewTab: "Open link in new tab",
    questionnaireLabel: "Questionnaire",
    questionsCountLabel: "Questions",
    questionsItemUnit: "Items",
    criteriaRespondentLabel: "Respondent Criteria",

    // Order card v3 — phase ② Jadwal Iklan (schedule cards)
    sectionInfo: "Booking Info",
    sectionBookingPayment: "Payment Details",
    rewardRespondentLabel: "Respondent Reward",
    adCostLabel: "Ad Fee",
    totalRewardLabel: "Total Reward",
    voucherCodeRowLabel: "Voucher Code",
    totalPaymentLabel: "Total Payment",
    sectionPublication: "Publication",
    bookingStatusChooseSchedule: "Awaiting Schedule",
    bookingStatusAwaitingAdminSchedule: "Team is scheduling",
    bookingStatusAwaitingInvoice: "Awaiting Invoice",
    bookingStatusTooLateToday: "Past Today's Cut-off",
    /** Jam diturunkan dari instant jadwalnya sendiri — Kilat tidak tayang 15.00. */
    airingStartTimeAt: "Starts at {time} WIB",
    voucherLabel: "Voucher",
    invoiceRowLabel: "Invoice",
    receiptRowLabel: "Receipt",
    viewCostBreakdown: "Cost Breakdown",
    hideCostBreakdown: "Hide Breakdown",
    viewInvoiceLink: "View invoice",
    viewReceiptLink: "View receipt",
    // Sisa tagihan, bukan harga penuh. 24 jadwal di produksi sudah dibayar
    // sebagian; sampai sekarang kartunya tetap menyebut angka penuh.
    paidSoFarLabel: "Paid so far",
    outstandingLabel: "Remaining",
    payRemaining: "Pay the rest",
    // Kilat yang gelombangnya belum ditetapkan TIDAK punya jam tayang untuk
    // ditampilkan — `start_date`-nya 00:00 WIB sebagai penampung, bukan jadwal.
    scheduleKilatHourPending: "airing time set by our team",
    // Harga jadwal ini belum pernah ditagihkan, jadi angkanya tarif HARI INI —
    // penawaran, bukan catatan. Lihat `utils/scheduleMoney.ts`.
    costIsEstimateNote: "Estimate at today's rate — the invoice is issued by our team.",
    incentiveNoAdditionNote: "No addition — current incentive still applies",
    calloutCancelledSchedule: "Our team cancelled this schedule. Need an explanation? Chat with Mimin below.",
    // Manual-review orders never pick their own airing date — the wizard skips
    // the schedule step for them. This replaces the reschedule button so the
    // card still says who is holding the next step.
    rescheduleHandledByTeam: "Our team will reschedule this for you. Need an explanation? Chat with Mimin below.",
    // slot_cancelled is NOT "expired" — a person cancelled it. Never say
    // "automatically" here; that sends the researcher looking for a mistake
    // they did not make.
    bookingStatusSlotCancelled: "Cancelled",
    bannerTitleSlotCancelled: "Airing date cancelled",
    bannerSubSlotCancelled: "The Jakpat team cancelled this order's airing date. Your questionnaire is still approved. Need an explanation? Chat with Mimin below.",
    scheduleEmptyRejected: "No airing schedule for this order yet.",
    publicationEmptyState: "Airing info will appear once a schedule is paid.",
    adPageLinkLabel: "Ad Page",
    viewsUnit: "views",

    // ─────────────────────────────────────────────────────────────
    // Banner Fase ② — anatominya TETAP di semua kondisi: judul pendek
    // (2–4 kata), satu kalimat "apa yang sedang terjadi", lalu langkah
    // berikutnya / siapa yang mengerjakan. Bagian yang tidak berlaku
    // DIHILANGKAN, bukan diganti kalimat pengisi.
    //
    // ⚠️ ATURAN EMAS: JANGAN PERNAH MENAMPILKAN DATA YANG BELUM ADA.
    // Tiap `{placeholder}` di bawah hanya boleh dirender kalau sumbernya
    // benar-benar terisi. `deadline` hanya ada saat slotnya dipesan
    // peneliti sendiri; `start_date` kosong untuk order yang belum
    // dijadwalkan; `kilat_slot_hour` NULL selama gelombangnya belum
    // ditetapkan. Kalau salah satunya kosong, barisnya TIDAK DIRENDER —
    // bukan diisi tebakan. Angka penampung yang dipajang seolah data
    // sungguhan lebih buruk daripada tidak menampilkan apa-apa.
    //
    // ⚠️ NOL WARNA MERAH. Tidak ada satu pun keadaan di Fase ② yang
    // benar-benar gagal — semuanya bisa dilanjutkan peneliti atau tim.
    // Merah membuat pesanan yang masih hidup terbaca seperti hangus.
    // slate = bukan giliranmu · amber = giliranmu · emerald = selesai.
    // ─────────────────────────────────────────────────────────────
    bannerTitleInReview: "Waiting for review",
    bannerSubInReview: "Your airing date is set once your questionnaire passes review.",
    bannerTitleAwaitingAdminSchedule: "Our team is scheduling",
    bannerSubAwaitingAdminSchedule: "Your questionnaire passed review. Our team is setting the airing date and preparing the invoice — max 1 working day.",
    bannerTitleChooseSchedule: "Pick an airing date",
    bannerSubChooseSchedule: "Your questionnaire passed review. Pick a date that is still available — your ad starts airing at 15:00 WIB.",
    bannerTitleAwaitingInvoice: "Waiting for the invoice",
    bannerSubAwaitingInvoice: "Your airing date is reserved. Our team is preparing the invoice — max 1 working day.",
    bannerSubAwaitingInvoiceSchedule: "This schedule's airing date is reserved. Our team is preparing its invoice.",
    bannerTitleStaleInvoice: "The old invoice no longer applies",
    bannerSubStaleInvoice: "The previous invoice was issued for {oldDate}, but your airing date is now {newDate}. Because the date changed, that invoice was cancelled.",
    bannerSubStaleInvoiceWait: "Wait for the replacement invoice from our team — do not pay the old link you may have received.",
    bannerTitleWaitingPayment: "Complete your payment",
    // Tiga sebab, tiga akibat berbeda. Satu kalimat untuk ketiganya berbohong
    // pada dua di antaranya — batas 14.00 WIB TIDAK melepas slot, dan jadwal
    // yang dipesan admin tidak pernah lepas sendiri sama sekali. Varian ketiga
    // sengaja tidak menyebut jam apa pun: di situ memang tidak ada tenggat.
    bannerSubWaitingPaymentSlot: "Pay before {time} so the date you reserved is not released.",
    bannerSubWaitingPaymentCutoff: "Pay before {time} so we still have time to prepare your ad. Your date stays reserved until then.",
    bannerSubWaitingPaymentSlotsLimited: "Ad slots are limited each day. Complete your payment before your date fills up.",
    bannerTitleWaitingPaymentPartial: "Complete the remaining payment",
    bannerSubPartiallyPaid: "We have received {paid}. {due} remaining.",
    bannerTitleExpired: "Reservation expired",
    bannerSubExpired: "The payment deadline passed, so the date you reserved was released automatically. You do not need to resubmit your questionnaire.",
    bannerSubPickNewDate: "Pick a new date that is still available.",
    // "Hari ini" DIBUANG: `isPaymentTooLateForDate` cocok untuk tanggal lampau
    // mana pun, jadi kartu order yang tertinggal seminggu pun berbunyi "hari
    // ini". Sebut tanggalnya.
    bannerTitleTooLateToday: "Payment deadline passed",
    bannerSubTooLateToday: "Payment for {date} was not completed before 14:00 WIB.",
    bannerSubPickNextDate: "Pick the next available airing date.",
    bannerTitleCancelledSchedule: "Schedule cancelled",

    // Placeholders
    scheduleSlotReleased: "Slot released (reschedule needed)",
    scheduleTooLate: "Past cut-off (reschedule needed)",
    scheduleNotYetChosen: "Not yet scheduled",
    schedulePendingReview: "Awaiting review approval",
    scheduleCancelled: "Schedule cancelled",
    periodAwaitingSchedule: "Awaiting schedule selection",
    invoiceAwaitingIssue: "Waiting for admin to issue invoice",
    invoiceExpired: "Invoice expired (please reschedule)",
    invoiceAwaitingSchedule: "Awaiting schedule selection",
    invoiceCancelled: "Invoice cancelled",
    invoicePaymentClosedToday: "Payment for today is closed",

    // Authentication pages
    authWelcomeBack: "Welcome Back",
    authCreateAccount: "Create New Account",
    authLoginSubtitle: "Log in to your Jakpat for Universities dashboard",
    authSignupSubtitle: "Sign up to publish surveys and reach respondents",
    authTabLogin: "Log In",
    authTabSignup: "Sign Up",
    authLoginWithGoogle: "Log in with Google",
    authSignupWithGoogle: "Sign up with Google",
    authOrWithEmail: "or with email",
    authFullName: "Full Name",
    authFullNamePlaceholder: "Your full name",
    authWhatsApp: "WhatsApp Number",
    authWhatsAppPlaceholder: "08xxxxxxxxxx",
    authUniversity: "University / Institution",
    authUniversityPlaceholder: "Select university...",
    authDepartment: "Faculty / Study Program",
    authDepartmentPlaceholder: "Select faculty / study program...",
    authAcademicStatus: "Academic Status",
    authAcademicStatusPlaceholder: "Select status...",
    optional: "optional",
    authReferralSource: "How did you hear about JFU?",
    authReferralSourcePlaceholder: "Select source...",
    authReferralSourceOther: "Specify other source...",
    authEmail: "Email",
    authEmailPlaceholder: "name@email.com",
    authPassword: "Password",
    authPasswordPlaceholder: "••••••••",
    authForgotPassword: "Forgot password?",
    authSubmitLogin: "Log In to Account",
    authSubmitSignup: "Sign Up Now",
    authStatusLecturer: "👨‍🏫 Lecturer / Researcher",
    authStatusS3: "🎓 Doctoral Student (S3)",
    authStatusS2: "🎓 Master's Student (S2)",
    authStatusS1: "🎓 Bachelor's Student (S1)",
    authStatusD3: "🎓 Diploma Student (D3)",
    authStatusHighSchool: "📚 High School Student",

    // Forgot Password page
    forgotPasswordTitle: "Forgot Password",
    forgotPasswordSubtitle: "Enter your account email to receive a password reset link",
    forgotPasswordCheckEmailTitle: "Check Your Email",
    forgotPasswordCheckEmailSubtitle: "We've sent a link to reset your account password",
    forgotPasswordSentNotice: "If {email} is registered, a password reset link has been sent. Check your inbox or spam folder.",
    forgotPasswordEmailLabel: "Account Email",
    forgotPasswordEmailNotRegistered: "This email is not registered in our system. Please check again or",
    forgotPasswordRegisterLink: "create a new account",
    forgotPasswordSubmit: "Send Reset Link",
    forgotPasswordBackToLogin: "Back to Log In",

    // Reset Password page
    resetPasswordTitle: "Set New Password",
    resetPasswordSubtitle: "Enter a new password for your Jakpat for Universities account",
    resetPasswordNewPasswordLabel: "New Password",
    resetPasswordNewPasswordPlaceholder: "Minimum 8 characters",
    resetPasswordConfirmLabel: "Confirm Password",
    resetPasswordConfirmPlaceholder: "Repeat new password",
    resetPasswordSubmit: "Save New Password",
    resetPasswordChecking: "Checking recovery link…",
    resetPasswordSuccessTitle: "Password Updated Successfully",
    resetPasswordSuccessDesc: "Redirecting to log in page…",
    resetPasswordInvalidTitle: "Invalid Link",
    resetPasswordInvalidDesc: "The reset link is invalid or has expired. Please request a new link from the login page.",
  },

  id: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Iklankan survey kamu ke 2 Juta responden Jakpat",

    // Step Navigation
    step1: "Detail Survey",

    // Step One - Survey Source Selection
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
    surveyLinkLabel: "Link Survei",
    surveyLinkPlaceholder: "https://forms.gle/... atau link survei Anda",

    surveyTitle: "Judul",
    surveyTitlePlaceholder: "Masukkan judul survey",
    surveyTitleFromGoogleDrive: "(dari Google Drive)",

    questionCount: "Pertanyaan",
    questionCountPlaceholder: "12",

    surveyDescription: "Deskripsi Survey",
    surveyDescriptionPlaceholder: "Masukkan deskripsi survey",

    // Buttons
    preview: "Preview",
    loading: "Loading...",
    continue: "Lanjut",
    cancel: "Batal",
    save: "Simpan",

    // Messages
    importedFromGoogle: "Diimport dari Google Drive",
    dataAutoFilled: "Data otomatis terisi dari Google Forms",

    // Validation
    required: "Field ini wajib diisi",
    invalidUrl: "Masukkan URL yang valid",

    // Footer
    footer: "Jakpat for Universities © 2025",

    // Total Cost
    perQuestion: "pertanyaan x 1 (hari)",

    // Step Two Fields
    surveyDurationLabel: "Durasi Tayang",
    surveyDurationPlaceholder: "Masukkan durasi dalam hari (1-30)",
    surveyDurationHelp: "Periode iklan akan dikonfirmasi oleh admin via WhatsApp setelah pembayaran",
    prizePerWinnerLabel: "Hadiah per-pemenang",
    prizePerWinnerPlaceholder: "Min. Rp 25.000",
    winnerCountLabel: "Jumlah Pemenang",
    winnerCountPlaceholder: "2-5 pemenang",
    incentiveDistributionInfo: "Jakpat akan mendistribusikan reward ke responden secara otomatis",
    maxWinnerWarning: "Saat ini kami memprioritaskan survei dengan jumlah pemenang maksimal 5 orang. Untuk informasi lebih lanjut, silakan",
    contactAdmin: "hubungi admin",
    totalIncentiveRequired: "Total Reward yang Dibutuhkan",
    recommendation: "Rekomendasi",
    perWinner: "/pemenang",
    respondentCriteriaPlaceholder: "Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif",
    respondentCriteriaLabel: "Kriteria Responden",
    respondentCriteriaHelp: "Kriteria responden pada iklan hanya digunakan sebagai *panduan pengundian hadiah*. Survei tetap ditayangkan ke *audiens berprofil acak*, sehingga responden yang mengisi akan *beragam*.",

    // Step One Method Selection
    importFromGoogleForm: "Import dari Google Form",
    manualFill: "Isi Manual",
    backButton: "Kembali",

    // Pemilih jadwal (copy layarnya ada di blok "Flow order" di bawah)
    slotClosedTodayLabel: "Tutup",
    slotErrorPastCutoff: "Batas pemesanan hari ini (13.00 WIB) sudah lewat. Silakan pilih tanggal lain.",
    slotErrorNoDate: "Silakan pilih tanggal mulai iklan Anda.",
    slotErrorFull: "Slot pada rentang tanggal yang dipilih sudah penuh (maksimal 3 antrean per hari). Silakan pilih tanggal lain.",
    slotErrorAvailabilityUnknown: "Ketersediaan slot belum berhasil dimuat, jadi tanggal ini belum bisa dikunci. Silakan coba lagi.",
    slotAvailabilityRetry: "Muat ulang ketersediaan slot",
    googleFormImportTitle: "Import dari Google Form",
    manualFillTitle: "Isi Manual",
    fillManually: "Isi Secara Manual",
    canChangeMethodLater: "Anda dapat mengubah metode nanti jika diperlukan",
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
    errorSurveyLinkEmpty: "Link survei tidak boleh kosong",
    errorInvalidSurveyUrl: "URL survei tidak valid. Pastikan diawali dengan http:// atau https://",
    errorTitleEmpty: "Judul survei tidak boleh kosong",
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

    // Payment Checkout Page
    checkoutTotalLabel: "Total Bayar",
    checkoutPaymentInfo: "Pembayaran diproses dengan aman melalui DOKU. Metode yang tersedia: QRIS, Virtual Account, Credit Card.",
    checkoutPayNow: "Bayar Sekarang",
    checkoutProcessing: "Membuka pembayaran...",
    checkoutAlreadyPaid: "Sudah bayar? Cek status pembayaran",
    checkoutCheckingStatus: "Mengecek status...",
    checkoutPaidSuccess: "Pembayaran berhasil! Mengarahkan ke halaman status...",
    checkoutNotPaidYet: "Pembayaran belum diterima. Silakan selesaikan pembayaran terlebih dahulu.",
    checkoutCheckError: "Gagal mengecek status pembayaran. Coba lagi.",
    checkoutPaymentError: "Gagal membuka link pembayaran. Silahkan coba lagi.",
    days: "Hari",

    // ─── Flow order: Detail → Ringkasan → Jadwal & Bayar → Sukses ───
    // Prinsipnya: tiap layar ditutup dengan menyebut apa yang terjadi
    // berikutnya, dan dibuka dengan menegaskan apa yang barusan selesai.

    // Langkah 1 — Detail Survei
    surveyDurationHint: "Rata-rata iklan di JFU menjangkau sekitar 200 responden per hari tayang. Ini gambaran dari iklan sebelumnya, bukan jaminan — hasil tiap survei berbeda tergantung topik dan kriteria respondenmu.",
    prizePerWinnerHint: "Hadiah ini diundi ke responden yang mengisi surveimu. Fungsinya menaikkan minat mengisi, jadi survei yang lebih panjang biasanya perlu hadiah lebih besar.",
    slotOutlook: "Dengan durasi {days}, {open} dari 14 hari ke depan masih bisa jadi tanggal mulai.",
    slotOutlookNone: "Dengan durasi {days}, belum ada tanggal mulai yang muat dalam 14 hari ke depan. Coba durasi yang lebih pendek.",
    continueToSummary: "Lanjut ke Detail Pembayaran",

    // Langkah 2 — Ringkasan
    summaryTitle: "Periksa pesananmu",
    summarySubtitle: "Belum ada pembayaran di langkah ini — kamu masih bisa kembali dan mengubah detail survei.",
    summaryCtaSchedule: "Lanjut Pilih Jadwal Tayang",
    summaryCtaPay: "Kunci Jadwal & Lanjut Bayar",
    summaryCtaReview: "Kirim untuk Diperiksa",
    summaryHintSchedule: "Setelah ini kamu pilih tanggal tayang, lalu menyelesaikan pembayaran.",
    summaryHintPay: "Tanggal tayangnya sudah dipilih — setelah ini tinggal menyelesaikan pembayaran.",
    summaryHintReview: "Tim kami memeriksa surveimu maksimal 2 hari kerja. Kami kabari lewat email begitu tagihan siap — belum ada pembayaran sekarang.",
    processing: "Memproses...",
    voucherManualVerifyTitle: "Voucher ini perlu diverifikasi dulu",
    voucherManualVerifyBody1: "Voucher",
    voucherManualVerifyBody2: "perlu diverifikasi tim kami dulu. Karena itu pesananmu masuk antrean pengecekan (maks. 2 hari kerja) dan jadwal tayang dipilih setelah verifikasi selesai, bukan sekarang. Belum ada pembayaran di tahap ini.",

    // Langkah 3 — Jadwal (Fase A)
    scheduleTitle: "Pilih kapan iklanmu tayang",
    scheduleSubtitle: "Iklan mulai tayang pukul 15.00 WIB sesuai tanggal yang kamu pilih.",
    scheduleCutoffNote: "Pemesanan untuk hari ini ditutup pukul 13.00 WIB.",
    scheduleLockCta: "Kunci Jadwal & Lanjut Bayar",
    scheduleConfirmKilatCta: "Pakai Tanggal Kilat Ini",
    scheduleHoldHint: "Slot ditahan 1 jam setelah dikunci supaya kamu sempat menyelesaikan pembayaran.",
    scheduleKilatHint: "Kamu akan mengonfirmasi ringkasan pesanan sekali lagi sebelum membayar.",
    scheduleEstimatedTitle: "Estimasi Jadwal Tayang",
    airingStartsAt: "Mulai 15.00 WIB",
    airingDurationBadge: "{days} Tayang",
    lockingSlotLoading: "Mengunci slotmu...",
    sendingForReviewLoading: "Mengirim surveimu...",
    slotLockedSuccess: "Jadwal terkunci. Selesaikan pembayaran untuk mengamankannya.",

    // Fase B — countdown di halaman pembayaran
    paymentPhaseTitle: "Selesaikan pembayaran",
    paymentPhaseSubtitle: "Bayar sebelum batas waktu untuk mengamankan slot tayang.",
    timerLabelHold: "Sisa waktu:",
    timerLabelCutoff: "Batas bayar hari ini (14.00 WIB) — sisa",
    timerConsequenceNote: "Kalau waktunya habis, slot dilepas untuk pemesan lain. Detail surveimu tetap tersimpan.",
    // Jadwal yang dibuat admin tidak punya umur — lihat utils/slotHold.ts.
    slotHeldByAdminLabel: "Slot ditahan admin untukmu",
    slotHeldByAdminNote: "Slot ini tidak punya hitung mundur dan tidak dilepas otomatis. Admin akan mengonfirmasi jadwalnya denganmu.",
    // Batas 14.00 WIB lewat, tapi slotnya TIDAK dilepas.
    paymentPastCutoffTitle: "Tanggal ini sudah tidak bisa dikejar",
    paymentPastCutoffBody: "Batas bayar 14.00 WIB untuk tanggal itu sudah lewat, jadi iklanmu tidak bisa tayang di tanggal tersebut. Slotmu tidak dilepas — kamu tetap bisa membayar, dan admin akan mengonfirmasi tanggal tayang barunya denganmu.",
    paymentExpiredTitle: "Waktu pembayaran habis",
    paymentExpiredHoldBody: "Slotnya sudah dilepas untuk pemesan lain. Detail surveimu masih tersimpan — tinggal pilih tanggal lain di bawah ini.",
    paymentExpiredCutoffBody: "Batas pembayaran 14.00 WIB untuk tanggal itu sudah lewat, jadi iklanmu belum bisa tayang di tanggal tersebut. Detail surveimu masih tersimpan — tinggal pilih tanggal lain di bawah ini.",
    rebookPickTitle: "Pilih tanggal tayang lain",
    rebookCta: "Kunci Jadwal Baru",
    rebookSuccess: "Jadwal baru terkunci. Selesaikan pembayaran sebelum waktunya habis.",
    rebookError: "Gagal mengunci jadwal baru. Silakan coba lagi.",
    paymentSubmissionNotFound: "Data pesanan tidak ditemukan.",
    paymentLoadError: "Gagal memuat data pembayaran.",

    // Halaman sukses setelah DOKU
    successPaidTitle: "Pembayaran diterima",
    successPaidBody: "Iklan survei “{title}” tayang {start} pukul 15.00 WIB, dan berjalan {days} sampai {end}.",
    successPaidBodyNoSchedule: "Pembayaran untuk “{title}” sudah kami terima. Jadwal tayangnya akan segera kami tetapkan dan muncul di Order Saya.",
    successFollowUp: "Kamu bisa memantau perkembangannya kapan saja di Order Saya.",
    successPendingTitle: "Sedang mengonfirmasi pembayaranmu",
    successPendingBody: "Kalau kamu baru saja menyelesaikan pembayaran, konfirmasi dari bank biasanya masuk dalam beberapa menit. Halaman ini memperbarui sendiri — tidak perlu ditutup.",
    successTxDetails: "Detail transaksi",
    successAiringLabel: "Jadwal tayang",
    successOrderIdLabel: "ID Pesanan",
    successNoScheduleYet: "Belum ditetapkan",
    successBadgePaid: "Lunas",
    successBadgePending: "Menunggu",
    successViewOrders: "Lihat Order Saya",
    successCheckNow: "Cek status sekarang",
    successChecking: "Mengecek...",
    successContactSupport: "Hubungi Bantuan",
    successCloseTab: "Tutup halaman ini",
    successNotFound: "Data pesanan tidak ditemukan",
    successLoadErrorTitle: "Terjadi kesalahan",
    successLoadError: "Gagal memuat data pesanan.",

    // Pesan gagal saat order ditulis
    errorNoScheduleSelected: "Pilih dulu tanggal tayangnya, ya.",
    errorSlotFullKilat: "Slot Kilat pada tanggal itu sudah penuh. Silakan pilih tanggal lain.",
    errorSlotFullRange: "Slot pada rentang tanggal itu sudah penuh. Silakan pilih tanggal lain.",
    errorAvailabilityCheck: "Gagal mengecek ketersediaan slot. Silakan coba lagi.",

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
    autoReviewCheckQuestions: "Membaca pertanyaan",
    autoReviewCheckPersonalData: "Memeriksa data pribadi",
    autoReviewCheckSummary: "Menyiapkan ringkasan",
    errorFormNotPublished: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorFormRestricted: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorInsufficientPermissionsTitle: "Izin Tidak Lengkap",
    errorInsufficientPermissionsDesc: "Mohon centang SEMUA kotak izin agar kami dapat me-review form Anda. Jangan khawatir, kami hanya membaca file yang Anda pilih saja.",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data berhasil ditinjau dan diimpor ke dalam sistem",

    // Section Titles - StepOne
    surveyInformation: "Informasi Survey",
    surveyConfiguration: "Konfigurasi Iklan",
    incentiveSettings: "Pengaturan Reward",
    surveyConfigurationDescription: "Tentukan kriteria responden dan reward untuk survey Anda",

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
    personalDataContinueButton: "Saya Mengerti, Lanjut Direview Admin",
    personalDataCancelButton: "Kembali & Edit Form",
    personalDataInlineNotePart1: "Sesuai",
    personalDataInlineNotePart2: ", form ini akan memerlukan Review Manual oleh tim admin.",
    personalDataRemoveHint: "Silakan hapus pertanyaan data pribadi di Google Form Anda, lalu import ulang.",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Gagal terhubung ke server. Periksa koneksi internet Anda.",

    // Google Drive Connect Steps
    googleConnectTitle: "Hubungkan Google Account",
    googleConnectDescription: "Hanya akses read-only ke Google Drive dan Google Forms Anda",
    permissionDrive: "Google Drive (read only)",
    permissionForms: "Google Forms (read only)",
    googleConnectButton: "Hubungkan dengan Google",
    googleConnectedTitle: "Terhubung ke Google Drive",
    googleConnectedMessage: "Akun Google Anda berhasil terhubung",
    titleSelectForm: "Pilih Survey Anda",
    descriptionSelectForm: "Tentukan file Google Form yang ingin diiklankan dari Google Drive.",
    buttonSelectForm: "Cari File di Drive",
    connectedAsEmail: "Terhubung dengan {email}",
    changeGoogleAccount: "Ganti Akun",
    changeSelectedForm: "Ganti Form",
    selectedSurveyTitle: "Survei selesai di-review",
    surveyRejectedTitle: "Kuesioner ditolak",
    questionsCountSuffix: "Pertanyaan",
    noSensitiveKeywords: "Tidak ada kata kunci sensitif",
    sensitiveKeywordsDetected: "Terdeteksi kata kunci sensitif",
    statusReadyToAdvertise: "Kuesioner siap diiklankan",
    statusDetectedIssue: "Terdeteksi masalah",
    statusDetectedSensitive: "Terdeteksi pertanyaan sensitif",
    personalDataReasonNote: "Terdeteksi pertanyaan sensitif: {keywords}. Sesuai Syarat & Ketentuan, kuesioner dengan data pribadi wajib ditinjau oleh admin.",
    technicalIssueReasonNote: "Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan.",
    googleSafetyToggle: "Data kamu aman!",
    googleSafetyPoint1: "Kami tidak bisa melihat file lain di Drive Anda",
    googleSafetyPoint2: "Sistem hanya membaca satu file yang Anda pilih",
    googleSafetyPoint3: "Izin hanya untuk menghitung model dan jumlah pertanyaan kuesioner",

    // Status Page
    pageTitle: "Order Saya",
    pageSubtitle: "Pantau progress submission survey Anda secara real-time.",
    statusAll: "Semua Status",
    statusInReview: "Under Review",
    statusWaitingPayment: "Awaiting Payment",
    statusScheduling: "Slot Reserved",
    statusScheduled: "Scheduled",
    statusPublishing: "Ready to Launch",
    statusCompleted: "Completed 🎉",
    // Lihat catatan di blok `en`.
    chooseSchedule: "Pilih Tanggal",
    rescheduleSlot: "Pilih Tanggal Baru",
    payNow: "Bayar Sekarang",
    contactSupport: "Butuh bantuan? Hubungi Support",
    downloadReceipt: "Unduh Bukti Pembayaran",
    airingPeriodLabel: "Jadwal Iklan",
    incentiveNewPeriod: "Periode baru",
    incentiveAccumulated: "diakumulasi ke insentif sebelumnya",
    periodBatchLabel: "Periode Undian",
    airingDateLabel: "Penayangan",
    scheduleExpiredHint: "Link pembayaran jadwal ini sudah kedaluwarsa. Tim kami akan menerbitkan penggantinya — chat Mimin di bawah kalau butuh lebih cepat.",
    extStatusWaitingPayment: "Menunggu Pembayaran",
    extStatusPaid: "Lunas",
    extStatusScheduled: "Terjadwal",
    extStatusLive: "Tayang",
    extStatusCompleted: "Selesai",
    extStatusCancelled: "Dibatalkan",
    extStatusExpired: "Kedaluwarsa",
    noSubmissions: "Belum ada submission",
    createFirstSurvey: "Buat Survey Baru",
    noSubmissionsDesc: "Anda belum mengajukan survei apapun untuk didistribusikan. Pilih salah satu opsi di bawah untuk mulai mendistribusikan surveimu ke responden Jakpat.",
    submittedOn: "Diajukan pada",

    winner: "pemenang",

    // Revision / Spam Status
    revisionNeededTitle: "Menunggu Perbaikan",
    revisionNeededDescPart1: "Terdapat kendala saat proses review, seperti tautan yang belum dapat diakses atau informasi yang belum sesuai dengan",
    revisionNeededDescPart2: " kami. Silakan perbarui data yang diperlukan dan submit ulang survei Anda.",
    resubmit: "Submit Ulang",
    delete: "Hapus",
    dismissSubmissionTitle: "Singkirkan order ini dari daftarmu?",
    dismissSubmissionDescPart1: "Order",
    dismissSubmissionDescPart2: "akan hilang dari daftarmu. Datanya tetap kami simpan, jadi tim kami masih bisa menelusurinya kalau kamu butuh bantuan soal order ini.",
    dismissSubmissionConfirm: "Singkirkan dari daftar",
    dismissSubmissionLoading: "Menyingkirkan…",
    untitledSurvey: "survei ini",
    deleteSubmissionSuccess: "Order disingkirkan dari daftarmu",
    deleteSubmissionError: "Gagal menyingkirkan order",

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
    respondentIncentiveLabel: 'Reward Responden',
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

    // Dashboard revamp — navigasi
    navOrders: "Order Saya",
    navMyOrder: "My Order",
    navTheForm: "Buat Kuesioner",
    navChatMimin: "Chat Mimin",
    navCreateOrder: "Buat Order",
    navHelp: "Bantuan",
    navProfile: "Profil",
    signOut: "Keluar",
    backToOrders: "Kembali ke Order Saya",
    refresh: "Muat ulang",
    language: "Bahasa",

    // Dashboard revamp — hub produk homepage
    createNewOrder: "Buat Order Baru",
    comingSoon: "Segera Hadir",
    productAdsTitle: "Iklan Survei",
    productAdsHook: "Untuk jangkauan maksimal —",
    productAdsDesc: "Tayangkan surveimu kepada ribuan responden aktif di aplikasi Jakpat.",
    productKilatTitle: "Kilat",
    productKilatHook: "Untuk kecepatan maksimal —",
    productKilatDesc: "Distribusi ekspres dengan push notification ke responden aktif Jakpat.",
    productRespAccessTitle: "Respondent Access",
    productRespAccessHook: "Untuk targeting presisi —",
    productRespAccessDesc: "Akses langsung ke responden untuk risetmu",
    productMissionTitle: "Misi & Aksi Khusus",
    productMissionHook: "Untuk aksi & tugas nyata —",
    productMissionDesc: "Mystery shopping ke toko/booth, coba fitur aplikasi/website, dan tasting sampel produk.",

    // Halaman pintu masuk produk (submit-iklan & submit-kilat)
    adsEntryHeroDesc: "Kami tayangkan surveimu ke ribuan responden aktif di aplikasi Jakpat — durasi iklannya kamu yang tentukan.",
    adsEntryMethodQuestion: "Sebelum surveimu ditayangkan",
    adsEntryAutoRowSources: "Google Forms & Microsoft Forms",
    adsEntryAutoRowHighlight: "Langsung reservasi jadwal iklan",
    adsEntryAutoRowTime: "Selesai dalam hitungan detik",
    adsEntryManualRowDesc: "Typeform, Qualtrics, atau survei manual",
    adsEntryManualRowHighlight: "Reservasi setelah review selesai",
    adsEntryManualRowTime: "Estimasi maksimal 2 hari kerja",
    adsEntryReviewNotePart1: "Sebelum ditayangkan, kami melakukan review teknis agar survei dapat tampil dengan baik di platform Jakpat dan sesuai dengan",
    adsEntryReviewNotePart2: " kami.",
    // CTA JFU Form di bawah pilihan metode
    jfuFormCtaLead: "Belum punya kuesioner?",
    jfuFormCtaAction: "coba buat kuesionermu dengan JFU Forms. Gratis",
    jfuFormPromoLead: "Bikin survei baru? Coba JFU Form",
    jfuFormPromoFree: "Gratis",
    jfuFormPromoProp1: "alternatif Qualtrics & SurveyMonkey",
    jfuFormPromoProp2: "tinggal chat, AI yang susunin pertanyaannya",
    jfuFormPromoProp3: "survei bisa “loncat” otomatis sesuai jawaban",
    msFormsImportTitle: "Microsoft Forms",
    kilatFactPush: "Distribusi ekspres lewat push notification di aplikasi Jakpat",
    kilatFactFast: "Hasil mulai masuk dalam hitungan jam",
    kilatFactOneDay: "Tayang penuh selama 1 hari",
    kilatFactPrice: "Tarif dasar + add-on {price}",
    kilatComingSoonNote: "Kilat belum dibuka untuk order langsung. Sementara ini, jangkau respondenmu lewat Iklan Survei.",
    kilatStartWithAds: "Mulai dengan Iklan Survei",
    profileSheetTitle: "Lengkapi profil dulu",
    profileSheetDesc: "Cukup sekali — data order dan invoice kamu diambil dari profil ini.",

    // Dashboard revamp — daftar order & filter
    filterAll: "Semua",
    filterNeedsAction: "Butuh Aksi",
    filterOngoing: "Berjalan",
    filterDone: "Selesai",
    noOrdersInFilter: "Tidak ada order di kategori ini.",
    noOrdersTitle: "Belum ada order",
    createFirstOrder: "Buat Order Pertama",
    chatAboutOrder: "Tanya Mimin",

    // Dashboard revamp — callout langkah berikutnya
    calloutReviewManual: "Survei kamu sedang direview admin — maksimal 2 hari kerja (Senin–Jumat). Hasilnya kami kabari via email.",
    calloutDetectedKeywords: "Terdeteksi:",
    calloutChooseSchedule: "Survei kamu disetujui! Pilih jadwal tayang untuk melanjutkan.",
    calloutPayBefore: "Selesaikan pembayaran sebelum",
    calloutPayBeforeSuffix: "agar slot tidak hangus.",
    calloutPayBeforeSuffixCutoff: "agar iklan bisa tayang di tanggal yang dijadwalkan.",
    calloutPaymentGeneric: "Selesaikan pembayaran untuk mengamankan jadwal tayang survei kamu.",
    calloutExpired: "Pembayaran kedaluwarsa dan slot dilepas. Pilih jadwal baru — tidak perlu submit ulang.",
    calloutTooLateToday: "Pembayaran untuk jadwal hari ini sudah lewat batas 14.00 WIB, jadi iklan belum bisa tayang hari ini. Pilih jadwal baru — tidak perlu submit ulang.",
    paymentQuotaPriorityNote: "Kuota penayangan iklan tersedia terbatas setiap harinya. Untuk itu, jadwal publish akan kami prioritaskan berdasarkan urutan pembayaran yang masuk. Agar bisa mendapatkan jadwal sesuai yang diharapkan, kami sarankan melakukan pembayaran sebelum kuota hari tersebut terpenuhi ya, Kak 🙏",
    calloutReadyPrefix: "Pembayaran diterima ✓. Survei kamu tayang mulai",
    calloutLivePrefix: "Survei kamu sedang tayang sampai",
    respondentExpectation: "JFU mengiklankan survei kamu ke responden Jakpat — jumlah respons bergantung minat responden dan tidak dijamin.",
    calloutCompletedPrefix: "Masa tayang selesai pada",
    calloutCompletedSuffix: "Terima kasih sudah menggunakan JFU!",

    // Dashboard revamp — accordion detail survei & info order
    copyOrderId: "Salin Booking ID",
    orderIdCopied: "Booking ID disalin ke clipboard",
    scheduleAdAgain: "Jadwalkan Iklan Lagi",
    scheduleAgainComingSoon: "Fitur jadwalkan iklan lagi akan segera hadir!",
    comingSoonBadge: "Segera Hadir",
    adDuration: "Durasi iklan",
    totalCost: "Total biaya",
    questionsUnit: "pertanyaan",
    detailPrize: "Insentif pemenang",

    // Order card v3 — fase ① Review
    phaseReviewTitle: "Review",
    // "Menunggu Perbaikan", bukan "Ditolak"/"Perlu Penyesuaian": statusnya BELUM
    // FINAL — admin masih bisa meloloskannya begitu peneliti memperbaiki, tanpa
    // peneliti perlu mengklik apa pun lebih dulu.
    reviewChipRejected: "Menunggu Perbaikan",
    reviewChipPending: "Di-review",
    reviewChipApproved: "Disetujui",
    reviewChipCancelled: "Dibatalkan",
    reviewTitleRejected: "Kuesioner Menunggu Perbaikan",
    reviewSubRejected: "Kuesioner Anda memerlukan beberapa perbaikan sebelum dapat kami proses ke tahap berikutnya. Ini bukan penolakan — begitu selesai, kami review lagi.",
    reviewTitleCancelled: "Pesanan Dibatalkan",
    cancelledByResearcher: "Kamu membatalkan pesanan ini",
    cancelledByAdmin: "Dibatalkan oleh tim Jakpat",
    cancelledStaleInvoiceWarning: "Tagihan yang sudah terbit tidak berlaku lagi. Jangan bayar link pembayaran yang mungkin sudah kamu terima.",
    cancelledNextStep: "Pesanan ini tidak akan tayang. Kalau masih ingin mengiklankan survei ini, silakan buat pesanan baru.",
    btnCancelOrder: "Batalkan Pesanan",
    cancelOrderConfirmTitle: "Batalkan pesanan ini?",
    cancelOrderConfirmBody: "Pesanan berhenti sampai di sini dan tidak akan tayang. Slot yang sudah dipesan dilepas, dan tagihan yang sudah terbit berhenti berlaku. Pesanannya tetap terlihat di tab \"Selesai\" supaya kamu masih bisa menelusurinya.",
    cancelOrderConfirmAction: "Ya, batalkan pesanan",
    cancelOrderSuccess: "Pesanan dibatalkan.",
    cancelOrderError: "Gagal membatalkan pesanan. Silakan coba lagi.",
    reviewerNotesTitle: "Catatan dari Tim Reviewer",
    reviewGuideText: "Perbaiki kuesioner Anda, lalu konfirmasi di bawah jika sudah selesai:",
    btnConfirmFixed: "Saya Sudah Perbaiki Kuesioner",
    btnChangeLink: "Ganti Link Form",
    // Namanya mengikuti label nav yang dilihat peneliti ("Order Saya"), bukan
    // istilah baru. Ia menyingkirkan kartu dari daftar; tidak menghapus apa pun.
    btnDeleteForm: "Hapus dari Order Saya",
    submittingReReview: "Mengirimkan...",
    reviewMethodAuto: "Google Forms",
    reviewMethodManual: "Manual Review",
    reviewMethodAutoHint: "Review otomatis",
    reviewMethodManualHint: "Review manual",
    openLinkInNewTab: "Buka link di tab baru",
    questionnaireLabel: "Kuesioner",
    questionsCountLabel: "Pertanyaan",
    questionsItemUnit: "Item",
    criteriaRespondentLabel: "Kriteria Responden",

    // Order card v3 — fase ② Jadwal Iklan (kartu jadwal)
    sectionInfo: "Info Booking",
    sectionBookingPayment: "Detail Pembayaran",
    rewardRespondentLabel: "Hadiah Undian",
    adCostLabel: "Biaya Iklan",
    totalRewardLabel: "Total Reward",
    voucherCodeRowLabel: "Voucher Code",
    totalPaymentLabel: "Total Pembayaran",
    sectionPublication: "Penayangan",
    bookingStatusChooseSchedule: "Menunggu jadwal dipilih",
    bookingStatusAwaitingAdminSchedule: "Tim sedang menjadwalkan",
    bookingStatusAwaitingInvoice: "Menunggu Tagihan",
    bookingStatusTooLateToday: "Lewat Batas Hari Ini",
    /** Jam diturunkan dari instant jadwalnya sendiri — Kilat tidak tayang 15.00. */
    airingStartTimeAt: "Mulai {time} WIB",
    voucherLabel: "Voucher",
    // ⚠️ SATU KATA UNTUK SATU BENDA. Empat kunci ini berbunyi Inggris di dalam
    // blok Indonesia, jadi satu layar peneliti mencampur "Invoice"/"Receipt"
    // dengan "tagihan"/"kuitansi" yang dipakai di tempat lain — termasuk di
    // drawer admin, yang sudah menyebutnya "Kuitansi".
    invoiceRowLabel: "Tagihan",
    receiptRowLabel: "Kuitansi",
    viewCostBreakdown: "Rincian Biaya",
    hideCostBreakdown: "Tutup Rincian",
    viewInvoiceLink: "Lihat tagihan",
    viewReceiptLink: "Lihat kuitansi",
    paidSoFarLabel: "Sudah dibayar",
    outstandingLabel: "Sisa tagihan",
    payRemaining: "Bayar Sisa",
    scheduleKilatHourPending: "jam tayang ditetapkan tim kami",
    costIsEstimateNote: "Estimasi tarif hari ini — tagihan resmi diterbitkan tim kami.",
    incentiveNoAdditionNote: "Tanpa tambahan — insentif berjalan tetap berlaku",
    calloutCancelledSchedule: "Jadwal ini dibatalkan tim kami. Butuh penjelasan? Chat Mimin di bawah.",
    rescheduleHandledByTeam: "Tim kami yang akan menjadwalkan ulang iklanmu. Butuh penjelasan? Chat Mimin di bawah.",
    bookingStatusSlotCancelled: "Dibatalkan",
    bannerTitleSlotCancelled: "Jadwal tayang dibatalkan",
    bannerSubSlotCancelled: "Tim Jakpat membatalkan tanggal tayang pesanan ini. Kuesionermu tetap lolos review. Butuh penjelasan? Chat Mimin di bawah.",
    scheduleEmptyRejected: "Belum ada jadwal iklan untuk pesanan ini.",
    publicationEmptyState: "Info penayangan akan muncul setelah ada jadwal yang lunas.",
    adPageLinkLabel: "Halaman Iklan",
    viewsUnit: "views",

    // ─────────────────────────────────────────────────────────────
    // Banner Fase ② — aturan lengkapnya di blok `en` (anatomi tetap,
    // aturan emas, nol warna merah). Yang khas di sisi Indonesia:
    //
    //   * kata "slot" hampir hilang. Itu kosakata internal; penelitinya
    //     memesan TANGGAL TAYANG. Disisakan hanya di varian
    //     `…SlotsLimited`, di mana "slot terbatas" memang menjelaskan
    //     kelangkaannya.
    //   * "admin" -> "tim kami", mengikuti kalimat yang sudah dipakai
    //     `calloutAwaitingAdminSchedule`.
    //   * "Anda" -> "kamu". Sebelum ini keduanya bercampur dalam SATU
    //     layar: `bannerSubChooseSchedule` memakai "Anda", sisanya "kamu".
    //   * judul jadi kalimat pendek huruf normal, bukan Judul Berkapital
    //     Setiap Kata — "Waktu Penyiapan Hari Ini Telah Lewat" berbunyi
    //     seperti pengumuman pengadilan.
    // ─────────────────────────────────────────────────────────────
    bannerTitleInReview: "Menunggu hasil review",
    bannerSubInReview: "Tanggal tayang ditentukan setelah kuesionermu lolos review.",
    bannerTitleAwaitingAdminSchedule: "Tim kami sedang menjadwalkan",
    bannerSubAwaitingAdminSchedule: "Kuesionermu sudah lolos review. Tim kami menetapkan tanggal tayang dan menyiapkan tagihannya — maksimal 1 hari kerja.",
    bannerTitleChooseSchedule: "Pilih tanggal tayang",
    // "gelombang" DIBUANG — itu kosakata Kilat. Iklan reguler tidak punya
    // gelombang; ia selalu mulai 15.00 WIB.
    bannerSubChooseSchedule: "Kuesionermu sudah lolos review. Pilih tanggal yang masih tersedia — iklanmu mulai tayang pukul 15.00 WIB.",
    bannerTitleAwaitingInvoice: "Menunggu tagihan",
    bannerSubAwaitingInvoice: "Tanggal tayangmu sudah dipesan. Tim kami sedang menyiapkan tagihannya — maksimal 1 hari kerja.",
    bannerSubAwaitingInvoiceSchedule: "Tanggal tayang jadwal ini sudah dipesan. Tim kami sedang menyiapkan tagihannya.",
    bannerTitleStaleInvoice: "Tagihan lama tidak berlaku",
    bannerSubStaleInvoice: "Tagihan sebelumnya diterbitkan untuk tanggal {oldDate}, sedangkan tanggal tayangmu sekarang {newDate}. Karena tanggalnya berubah, tagihan itu dibatalkan.",
    bannerSubStaleInvoiceWait: "Tunggu tagihan pengganti dari tim kami — jangan bayar link lama yang mungkin sudah kamu terima.",
    bannerTitleWaitingPayment: "Selesaikan pembayaran",
    // Tiga sebab, tiga akibat berbeda — lihat catatan di blok `en`.
    bannerSubWaitingPaymentSlot: "Bayar sebelum {time} agar tanggal yang kamu pesan tidak dilepas.",
    bannerSubWaitingPaymentCutoff: "Bayar sebelum {time} agar kami sempat menyiapkan iklanmu. Tanggalmu aman sampai batas itu.",
    bannerSubWaitingPaymentSlotsLimited: "Slot iklan terbatas setiap hari. Selesaikan pembayaran sebelum tanggalmu terisi.",
    bannerTitleWaitingPaymentPartial: "Selesaikan sisa pembayaran",
    bannerSubPartiallyPaid: "{paid} sudah kami terima. Sisa {due}.",
    bannerTitleExpired: "Reservasi kedaluwarsa",
    // "otomatis" di SINI benar — yang lepas adalah hold 1 jam, dan tidak ada
    // manusia yang menekannya. Jangan menyalinnya ke `slot_cancelled`.
    bannerSubExpired: "Batas pembayaran terlewat, jadi tanggal yang kamu pesan dilepas otomatis. Kuesionermu tidak perlu diajukan ulang.",
    bannerSubPickNewDate: "Pilih tanggal baru yang masih tersedia.",
    bannerTitleTooLateToday: "Batas bayar terlewat",
    bannerSubTooLateToday: "Pembayaran untuk {date} tidak selesai sebelum pukul 14.00 WIB.",
    bannerSubPickNextDate: "Pilih tanggal tayang berikutnya.",
    bannerTitleCancelledSchedule: "Jadwal dibatalkan",

    // Placeholders
    scheduleSlotReleased: "Slot dilepas (perlu dijadwalkan ulang)",
    scheduleTooLate: "Jadwal lewat batas (perlu dijadwalkan ulang)",
    scheduleNotYetChosen: "Belum dijadwalkan",
    schedulePendingReview: "Menunggu persetujuan review",
    scheduleCancelled: "Jadwal dibatalkan",
    periodAwaitingSchedule: "Menunggu jadwal dipilih",
    invoiceAwaitingIssue: "Menunggu tagihan diterbitkan admin",
    invoiceExpired: "Tagihan kedaluwarsa (jadwalkan ulang)",
    invoiceAwaitingSchedule: "Menunggu jadwal dipilih",
    invoiceCancelled: "Tagihan dibatalkan",
    invoicePaymentClosedToday: "Pembayaran hari ini ditutup",

    // Authentication pages
    authWelcomeBack: "Selamat Datang Kembali",
    authCreateAccount: "Buat Akun Baru",
    authLoginSubtitle: "Masuk ke dashboard Jakpat for Universities",
    authSignupSubtitle: "Daftar untuk memasang survei dan menjangkau responden",
    authTabLogin: "Masuk",
    authTabSignup: "Daftar Akun",
    authLoginWithGoogle: "Masuk dengan Google",
    authSignupWithGoogle: "Daftar dengan Google",
    authOrWithEmail: "atau dengan email",
    authFullName: "Nama Lengkap",
    authFullNamePlaceholder: "Nama lengkap kamu",
    authWhatsApp: "Nomor WhatsApp",
    authWhatsAppPlaceholder: "08xxxxxxxxxx",
    authUniversity: "Universitas / Institusi",
    authUniversityPlaceholder: "Pilih universitas...",
    authDepartment: "Fakultas / Program Studi",
    authDepartmentPlaceholder: "Pilih fakultas / prodi...",
    authAcademicStatus: "Status Akademik",
    authAcademicStatusPlaceholder: "Pilih status...",
    optional: "opsional",
    authReferralSource: "Tahu JFU dari mana?",
    authReferralSourcePlaceholder: "Pilih sumber...",
    authReferralSourceOther: "Sebutkan sumber lainnya...",
    authEmail: "Email",
    authEmailPlaceholder: "nama@email.com",
    authPassword: "Password",
    authPasswordPlaceholder: "••••••••",
    authForgotPassword: "Lupa password?",
    authSubmitLogin: "Masuk ke Akun",
    authSubmitSignup: "Daftar Akun Sekarang",
    authStatusLecturer: "👨‍🏫 Dosen",
    authStatusS3: "🎓 Mahasiswa S3 (Doktor)",
    authStatusS2: "🎓 Mahasiswa S2 (Master)",
    authStatusS1: "🎓 Mahasiswa S1 (Sarjana)",
    authStatusD3: "🎓 Mahasiswa D3 (Diploma)",
    authStatusHighSchool: "📚 Pelajar SMA/SMK",

    // Forgot Password page
    forgotPasswordTitle: "Lupa Password",
    forgotPasswordSubtitle: "Masukkan email akunmu untuk menerima tautan reset password",
    forgotPasswordCheckEmailTitle: "Cek Email Kamu",
    forgotPasswordCheckEmailSubtitle: "Kami sudah mengirim tautan untuk mengatur ulang password akunmu",
    forgotPasswordSentNotice: "Jika {email} terdaftar, tautan reset password sudah dikirim. Cek inbox atau folder spam kamu.",
    forgotPasswordEmailLabel: "Email Akun",
    forgotPasswordEmailNotRegistered: "Email ini tidak terdaftar di sistem kami. Periksa kembali atau",
    forgotPasswordRegisterLink: "daftar akun baru",
    forgotPasswordSubmit: "Kirim Tautan Reset",
    forgotPasswordBackToLogin: "Kembali ke Login",

    // Reset Password page
    resetPasswordTitle: "Atur Password Baru",
    resetPasswordSubtitle: "Masukkan password baru untuk akun Jakpat for Universities kamu",
    resetPasswordNewPasswordLabel: "Password Baru",
    resetPasswordNewPasswordPlaceholder: "Minimal 8 karakter",
    resetPasswordConfirmLabel: "Konfirmasi Password",
    resetPasswordConfirmPlaceholder: "Ulangi password baru",
    resetPasswordSubmit: "Simpan Password Baru",
    resetPasswordChecking: "Memeriksa tautan pemulihan…",
    resetPasswordSuccessTitle: "Password Berhasil Diperbarui",
    resetPasswordSuccessDesc: "Mengarahkan kembali ke halaman login…",
    resetPasswordInvalidTitle: "Tautan Tidak Valid",
    resetPasswordInvalidDesc: "Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru dari halaman login.",
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
