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
    chooseSchedule: "Choose Schedule",
    rescheduleSlot: "Reschedule",
    payNow: "Pay Now",
    contactSupport: "Need help? Contact Support",
    downloadReceipt: "Download Receipt",
    airingPeriodLabel: "Ad Schedule",
    incentiveNewPeriod: "New period",
    incentiveAccumulated: "added to the previous incentive pool",
    periodBatchLabel: "Period",
    airingDateLabel: "Reservation Date",
    scheduleExpiredHint: "The payment link for this ad schedule has expired. Please contact the admin to have it reissued.",
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
    incentiveDistributionInfo: "Jakpat will distribute incentives to respondents automatically",
    maxWinnerWarning: "Currently, we prioritize surveys with a maximum of 5 winners. For more information, please",
    contactAdmin: "contact admin",
    totalIncentiveRequired: "Total Incentive Required",
    recommendation: "Recommendation",
    perWinner: "/winner",
    respondentCriteriaPlaceholder: "Example: Age 18-35 years, Jakarta Domicile, Active Student",
    respondentCriteriaLabel: "Respondent Criteria",
    respondentCriteriaHelp: "Respondent criteria on ads are only used as a *guide for prize draws*. Surveys are still distributed to a *randomly profiled audience*, so the respondents who complete them will be *diverse*.",


    // Step One Method Selection
    importFromGoogleForm: "Import from Google Form",
    manualFill: "Fill Manually",
    backButton: "Back",

    // Step Three - Slot Reservation
    slotReservationTitle: "Ad Slot Reservation",
    slotReservationInfo: "Choose the start date for your survey ad. Ads on the <strong>Auto-Approval</strong> track will be processed immediately without manual admin review.",
    slotStartDateLabel: "Ad Start Date",
    slotDurationLabel: "Ad Duration",
    slotFixedTimeTitle: "Ad goes live at 15:00 WIB",
    slotFixedTimeDesc: "Start time is set automatically for all ads. Same-day bookings close at 13:00 WIB so we have time to build your ad page.",
    slotClosedTodayLabel: "Closed",
    slotClosedTodayNote: "Bookings for today are closed (cut-off 13:00 WIB). Please pick the next available date — ads go live at 15:00 WIB.",
    slotErrorPastCutoff: "Today's booking cut-off (13:00 WIB) has passed. Please choose another date.",
    paymentTooLateToday: "The 14:00 WIB payment cut-off for today's schedule has passed, so this ad can no longer go live today. Please pick a new schedule from My Orders — no need to resubmit.",
    slotErrorNoDate: "Please select a start date for your ad.",
    slotErrorFull: "Slots for the selected date range are full (max 3 per day). Please choose a different date.",
    slotErrorLoad: "Failed to load slot availability. Please try again.",
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
    autoReviewCheckQuestions: "Reading questions",
    autoReviewCheckPersonalData: "Checking for personal data",
    autoReviewCheckSummary: "Preparing summary",
    errorFormNotPublished: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorFormRestricted: "Import Failed for \"{title}\"! The form is restricted, unpublished, or not accepting responses. Please click \"Send\" in your Google Form, set link access to \"Anyone with the link\", and verify that Google or organizational login is not required.",
    errorInsufficientPermissionsTitle: "Insufficient Permissions",
    errorInsufficientPermissionsDesc: "Please check ALL permission boxes so we can review your form. Don't worry, we only read the file you select.",

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
    personalDataContinueButton: "I Understand, Continue to Admin Review",
    personalDataCancelButton: "Back to Edit Form",
    personalDataInlineNotePart1: "Per our",
    personalDataInlineNotePart2: ", this form will require Admin Review.",
    personalDataRemoveHint: "Please remove the personal data questions from your Google Form, then import again.",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Failed to connect to server. Please check your internet connection.",

    // Revision / Spam Status
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

    // Dashboard revamp — navigation
    navOrders: "My Orders",
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

    // Product entry pages (submit-iklan & submit-kilat)
    adsEntryHeroDesc: "We air your survey to thousands of active respondents in the Jakpat app — you decide how long it runs.",
    adsEntryMethodQuestion: "Before your survey is published",
    adsEntryAutoRowSources: "Google Forms & Microsoft Forms",
    adsEntryAutoRowHighlight: "Instant ad schedule reservation",
    adsEntryAutoRowTime: "Done in seconds",
    adsEntryManualRowDesc: "Typeform, Qualtrics, or manual survey",
    adsEntryManualRowHighlight: "Reservation after check completes",
    adsEntryManualRowTime: "Estimated max 2 working days",
    adsEntryReviewNotePart1: "Before publishing, we perform technical checks to ensure your survey renders well on the Jakpat platform and complies with our",
    adsEntryReviewNotePart2: ".",
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
    calloutAwaitingInvoice: "Slot reserved. Waiting for the admin to issue your invoice — max 1 working day.",
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
    reviewChipRejected: "Needs Revision",
    reviewChipPending: "In Review",
    reviewChipApproved: "Approved",
    // Label chip = SUMBER form; hint = SIAPA yang mereview. Dua fakta berbeda
    // yang dulu dipadatkan jadi satu kalimat ("Auto Review - Google Form").
    reviewMethodAuto: "Google Forms",
    reviewMethodManual: "Manual Review",
    reviewMethodAutoHint: "Automatic check",
    reviewMethodManualHint: "Checked by our team",
    openLinkInNewTab: "Open link in new tab",

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
    bookingStatusAwaitingInvoice: "Awaiting Invoice",
    bookingStatusTooLateToday: "Past Today's Cut-off",
    airingStartTimeNote: "Starts at 15:00 WIB",
    voucherLabel: "Voucher",
    invoiceRowLabel: "Invoice",
    receiptRowLabel: "Receipt",
    viewInvoiceLink: "View invoice",
    viewReceiptLink: "View receipt",
    incentiveNoAdditionNote: "No addition — current incentive still applies",
    calloutAwaitingInvoiceSchedule: "Waiting for the admin to issue the invoice for this ad schedule.",
    calloutCancelledSchedule: "This schedule was cancelled by the admin. Need an explanation? Chat with Mimin below.",
    scheduleEmptyRejected: "Finish your survey revision first to continue to the ad schedule.",
    scheduleEmptyPending: "Ad schedules can be picked once your review is approved.",
    publicationEmptyState: "Airing info will appear once a schedule is paid.",
    adPageLinkLabel: "Ad Page",
    viewsUnit: "views",
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
    incentiveDistributionInfo: "Jakpat akan mendistribusikan insentif ke responden secara otomatis",
    maxWinnerWarning: "Saat ini kami memprioritaskan survei dengan jumlah pemenang maksimal 5 orang. Untuk informasi lebih lanjut, silakan",
    contactAdmin: "hubungi admin",
    totalIncentiveRequired: "Total Insentif yang Dibutuhkan",
    recommendation: "Rekomendasi",
    perWinner: "/pemenang",
    respondentCriteriaPlaceholder: "Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif",
    respondentCriteriaLabel: "Kriteria Responden",
    respondentCriteriaHelp: "Kriteria responden pada iklan hanya digunakan sebagai *panduan pengundian hadiah*. Survei tetap ditayangkan ke *audiens berprofil acak*, sehingga responden yang mengisi akan *beragam*.",

    // Step One Method Selection
    importFromGoogleForm: "Import dari Google Form",
    manualFill: "Isi Manual",
    backButton: "Kembali",

    // Step Three - Slot Reservation
    slotReservationTitle: "Reservasi Slot Iklan",
    slotReservationInfo: "Pilih tanggal mulai iklan survei Anda. Iklan dengan jalur <strong>Auto-Approval</strong> akan langsung diproses tanpa review manual oleh admin.",
    slotStartDateLabel: "Tanggal Mulai Iklan",
    slotDurationLabel: "Durasi Iklan",
    slotFixedTimeTitle: "Iklan mulai tayang pukul 15.00 WIB",
    slotFixedTimeDesc: "Waktu tayang sudah ditetapkan otomatis untuk semua iklan. Pemesanan untuk hari yang sama ditutup pukul 13.00 WIB agar kami sempat menyiapkan halaman iklannya.",
    slotClosedTodayLabel: "Tutup",
    slotClosedTodayNote: "Pemesanan untuk hari ini sudah ditutup (batas 13.00 WIB). Silakan pilih tanggal berikutnya — iklan tayang mulai 15.00 WIB.",
    slotErrorPastCutoff: "Batas pemesanan hari ini (13.00 WIB) sudah lewat. Silakan pilih tanggal lain.",
    paymentTooLateToday: "Batas pembayaran 14.00 WIB untuk jadwal hari ini sudah lewat, jadi iklan ini belum bisa tayang hari ini. Silakan pilih jadwal baru dari Order Saya — tidak perlu submit ulang.",
    slotErrorNoDate: "Silakan pilih tanggal mulai iklan Anda.",
    slotErrorFull: "Slot pada rentang tanggal yang dipilih sudah penuh (maksimal 3 antrean per hari). Silakan pilih tanggal lain.",
    slotErrorLoad: "Gagal memuat ketersediaan slot. Silakan coba lagi.",
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
    autoReviewCheckQuestions: "Membaca pertanyaan",
    autoReviewCheckPersonalData: "Memeriksa data pribadi",
    autoReviewCheckSummary: "Menyiapkan ringkasan",
    errorFormNotPublished: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorFormRestricted: "Gagal Import untuk \"{title}\"! Google Form Anda tertutup (restricted), belum di-publish, atau tidak menerima tanggapan. Silakan klik \"Kirim/Send\", ubah izin akses menjadi \"Siapa saja yang memiliki link\" (Anyone with the link), dan pastikan syarat login Google/organisasi dinonaktifkan.",
    errorInsufficientPermissionsTitle: "Izin Tidak Lengkap",
    errorInsufficientPermissionsDesc: "Mohon centang SEMUA kotak izin agar kami dapat me-review form Anda. Jangan khawatir, kami hanya membaca file yang Anda pilih saja.",

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
    chooseSchedule: "Pilih Jadwal",
    rescheduleSlot: "Jadwalkan Ulang",
    payNow: "Bayar Sekarang",
    contactSupport: "Butuh bantuan? Hubungi Support",
    downloadReceipt: "Unduh Bukti Pembayaran",
    airingPeriodLabel: "Jadwal Iklan",
    incentiveNewPeriod: "Periode baru",
    incentiveAccumulated: "diakumulasi ke insentif sebelumnya",
    periodBatchLabel: "Periode",
    airingDateLabel: "Penayangan",
    scheduleExpiredHint: "Link pembayaran jadwal iklan ini telah kedaluwarsa. Silakan hubungi admin untuk menerbitkannya ulang.",
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

    // Dashboard revamp — navigasi
    navOrders: "Order Saya",
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

    // Halaman pintu masuk produk (submit-iklan & submit-kilat)
    adsEntryHeroDesc: "Kami tayangkan surveimu ke ribuan responden aktif di aplikasi Jakpat — durasi iklannya kamu yang tentukan.",
    adsEntryMethodQuestion: "Sebelum surveimu ditayangkan",
    adsEntryAutoRowSources: "Google Forms & Microsoft Forms",
    adsEntryAutoRowHighlight: "Langsung reservasi jadwal iklan",
    adsEntryAutoRowTime: "Selesai dalam hitungan detik",
    adsEntryManualRowDesc: "Typeform, Qualtrics, atau survei manual",
    adsEntryManualRowHighlight: "Reservasi setelah pengecekan selesai",
    adsEntryManualRowTime: "Estimasi maksimal 2 hari kerja",
    adsEntryReviewNotePart1: "Sebelum ditayangkan, kami melakukan pengecekan teknis agar survei dapat tampil dengan baik di platform Jakpat dan sesuai dengan",
    adsEntryReviewNotePart2: " kami.",
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
    calloutAwaitingInvoice: "Slot berhasil dipesan. Menunggu admin menerbitkan tagihan — maksimal 1 hari kerja.",
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
    reviewChipRejected: "Perlu Revisi",
    reviewChipPending: "Di-review",
    reviewChipApproved: "Disetujui",
    reviewMethodAuto: "Google Forms",
    reviewMethodManual: "Manual Review",
    reviewMethodAutoHint: "Pengecekan otomatis",
    reviewMethodManualHint: "Pengecekan oleh tim kami",
    openLinkInNewTab: "Buka link di tab baru",

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
    bookingStatusAwaitingInvoice: "Menunggu Tagihan",
    bookingStatusTooLateToday: "Lewat Batas Hari Ini",
    airingStartTimeNote: "Mulai 15.00 WIB",
    voucherLabel: "Voucher",
    invoiceRowLabel: "Invoice",
    receiptRowLabel: "Kwitansi",
    viewInvoiceLink: "Lihat invoice",
    viewReceiptLink: "Lihat kwitansi",
    incentiveNoAdditionNote: "Tanpa tambahan — insentif berjalan tetap berlaku",
    calloutAwaitingInvoiceSchedule: "Menunggu admin menerbitkan tagihan untuk jadwal iklan ini.",
    calloutCancelledSchedule: "Jadwal ini dibatalkan oleh admin. Butuh penjelasan? Chat Mimin di bawah.",
    scheduleEmptyRejected: "Selesaikan revisi survei terlebih dahulu untuk melanjutkan ke jadwal iklan.",
    scheduleEmptyPending: "Jadwal iklan bisa dipilih setelah review disetujui.",
    publicationEmptyState: "Info penayangan akan muncul setelah ada jadwal yang lunas.",
    adPageLinkLabel: "Halaman Iklan",
    viewsUnit: "views",
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
