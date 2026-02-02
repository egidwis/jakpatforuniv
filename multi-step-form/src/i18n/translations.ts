// Translation files for English and Indonesian

export type Language = 'en' | 'id';

export const translations = {
  en: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Submit your survey to 2 million Jakpat respondents",

    // Step Navigation
    step1: "Survey Details",
    step2: "Configuration & Incentive",
    step3: "Personal Data",
    step4: "Review & Payment",

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

    // Status Page
    pageTitle: "Track Status",
    pageSubtitle: "Monitor the progress of your survey submissions in real-time.",
    statusAll: "All Status",
    statusInReview: "In Review",
    statusWaitingPayment: "Waiting Payment",
    statusScheduling: "Scheduling",
    statusPublishing: "Publishing",
    statusCompleted: "Completed",
    statusInReviewHelper: "Waiting for Admin Review",
    statusPaymentHelper: "Waiting for Payment",
    statusSchedulingHelper: "Scheduling Process",
    statusPublishingHelper: "Currently Live",
    statusCompletedHelper: "Completed",
    payNow: "Pay Now",
    contactSupport: "Need help? Contact Support",
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
    totalIncentiveRequired: "Total Incentive Required",
    recommendation: "Recommendation",
    perWinner: "/winner",
    respondentCriteriaPlaceholder: "Example: Age 18-35 years, Jakarta Domicile, Active Student",
    respondentCriteriaLabel: "Respondent Criteria",


    // Step Three Fields
    contactInformation: "Contact Information",
    academicInformation: "Academic Information",
    referralSourceTitle: "How Did You Find Us?",

    fullNameLabel: "Full Name",
    fullNamePlaceholder: "e.g., John Doe",
    fullNameHelp: "Enter full name as per ID card",

    emailLabel: "Email",
    emailPlaceholder: "e.g., john.doe@university.ac.id",
    emailHelp: "Active email for payment notifications",

    phoneNumberLabel: "Phone Number",
    phoneNumberPlaceholder: "e.g., 081234567890",
    phoneNumberHelp: "Format: 08xxxxxxxxxx (without spaces or dashes)",

    universityLabel: "University",
    universityPlaceholder: "e.g., University of Indonesia",
    universityHelp: "Name of university or educational institution",

    departmentLabel: "Department / Faculty",
    departmentPlaceholder: "e.g., Computer Science",
    departmentHelp: "Your department or faculty",

    statusLabel: "Academic Status",
    statusPlaceholder: "Select academic status",
    statusHelp: "Select your current academic status",

    referralSourceLabel: "Where did you hear about Jakpat for Universities?",
    referralSourcePlaceholder: "Select source",
    referralSourceHelp: "Select where you found out about us",

    referralSourceOtherLabel: "Specify Source",
    referralSourceOtherPlaceholder: "Specify source",
    referralSourceOtherHelp: "Required if 'Other' is selected",

    // Step One Method Selection
    startByFillingData: "Start by filling in survey data",
    chooseMethodSuitable: "Choose the method that suits you best.",
    importFromGoogleForm: "Import from Google Form",
    manualFill: "Fill Manually",
    backButton: "Back",
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
    totalPayment: "Total Payment",
    disclaimer: "By proceeding, you agree to our Terms of Service and Privacy Policy",

    // Buttons
    proceedPayment: "Proceed to Payment",
    submitForReview: "Submit for Admin Review",

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

    // Validation Error Messages - StepThree
    errorFullNameEmpty: "Full name cannot be empty",
    errorEmailEmpty: "Email cannot be empty",
    errorEmailInvalid: "Invalid email format",
    errorPhoneEmpty: "Phone number cannot be empty",
    errorPhoneMinLength: "Phone number minimum 10 digits",
    errorUniversityEmpty: "University cannot be empty",
    errorDepartmentEmpty: "Department cannot be empty",
    errorStatusRequired: "Academic status must be selected",
    errorReferralSourceOther: "Please specify other information source",

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

    // Error Messages - GoogleDriveImportSimple
    errorConnectGoogleDrive: "Failed to connect to Google Drive",
    errorConnectFirst: "Please connect to Google Drive first",
    errorExtractFormData: "Failed to extract form data",
    errorSelectForm: "Failed to select form",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data successfully imported from Google Drive",

    // Section Titles - StepTwo
    surveyConfiguration: "Survey Configuration",
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
  },

  id: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Iklankan survey kamu ke 2 Juta responden Jakpat",

    // Step Navigation
    step1: "Detail Survey",
    step2: "Konfigurasi & Insentif",
    step3: "Data Diri",
    step4: "Review & Pembayaran",

    // Step One - Survey Source Selection
    surveyDetails: "Detail Survey",
    chooseSurveySource: "Pilih sumber survey Anda",

    // Google Form Option
    googleFormOption: "Google Form",
    googleFormDescription: "Import pertanyaan dari Google Forms dengan akurasi 100%. Data otomatis terisi dari form Anda.",
    googleDriveAccess: "Akses ke Google Drive",

    // Other Source Option
    otherSourceOption: "From other source",
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
    authenticationSuccessful: "Authentication successful",
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
    totalIncentiveRequired: "Total Insentif yang Dibutuhkan",
    recommendation: "Rekomendasi",
    perWinner: "/pemenang",
    respondentCriteriaPlaceholder: "Contoh: Usia 18-35 tahun, Domisili Jakarta, Mahasiswa aktif",
    respondentCriteriaLabel: "Kriteria Responden",
    respondentCriteriaHelp: "Kriteria ini akan ditampilkan di postingan iklan",

    // Step Two Fields


    // Step Three Fields
    contactInformation: "Informasi Kontak",
    academicInformation: "Informasi Akademik",
    referralSourceTitle: "Dari Mana Anda Mengetahui Kami?",

    fullNameLabel: "Nama Lengkap",
    fullNamePlaceholder: "Contoh: Budi Santoso",
    fullNameHelp: "Masukkan nama lengkap sesuai KTP",

    emailLabel: "Email",
    emailPlaceholder: "Contoh: budi.santoso@university.ac.id",
    emailHelp: "Email aktif untuk notifikasi pembayaran",

    phoneNumberLabel: "No Telepon",
    phoneNumberPlaceholder: "Contoh: 081234567890",
    phoneNumberHelp: "Format: 08xxxxxxxxxx (tanpa spasi atau tanda hubung)",

    universityLabel: "Universitas",
    universityPlaceholder: "Contoh: Universitas Indonesia",
    universityHelp: "Nama universitas atau institusi pendidikan",

    departmentLabel: "Jurusan / Fakultas",
    departmentPlaceholder: "Contoh: Ilmu Komputer",
    departmentHelp: "Jurusan atau fakultas Anda",

    statusLabel: "Status Akademik",
    statusPlaceholder: "Pilih status akademik",
    statusHelp: "Pilih status akademik Anda saat ini",

    referralSourceLabel: "Tahu Jakpat for Universities dari mana?",
    referralSourcePlaceholder: "Pilih sumber informasi",
    referralSourceHelp: "Pilih dari mana Anda mengetahui tentang kami",

    referralSourceOtherLabel: "Sebutkan Sumber",
    referralSourceOtherPlaceholder: "Sebutkan sumber informasi",
    referralSourceOtherHelp: "Wajib diisi jika memilih 'Lainnya'",

    // Step One Method Selection
    startByFillingData: "Mulai dengan mengisi data survei",
    chooseMethodSuitable: "Pilih metode yang paling sesuai untuk Anda.",
    importFromGoogleForm: "Import dari Google Form",
    manualFill: "Isi Manual",
    backButton: "Kembali",
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
    totalPayment: "Total Pembayaran",
    disclaimer: "Dengan melanjutkan, Anda menyetujui Syarat Layanan dan Kebijakan Privasi kami",

    // Buttons
    proceedPayment: "Lanjut ke Pembayaran",
    submitForReview: "Kirim untuk Review Admin",

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

    // Validation Error Messages - StepThree
    errorFullNameEmpty: "Nama lengkap tidak boleh kosong",
    errorEmailEmpty: "Email tidak boleh kosong",
    errorEmailInvalid: "Format email tidak valid",
    errorPhoneEmpty: "Nomor telepon tidak boleh kosong",
    errorPhoneMinLength: "Nomor telepon minimal 10 digit",
    errorUniversityEmpty: "Universitas tidak boleh kosong",
    errorDepartmentEmpty: "Jurusan tidak boleh kosong",
    errorStatusRequired: "Status akademik harus dipilih",
    errorReferralSourceOther: "Sebutkan sumber informasi lainnya",

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

    // Error Messages - GoogleDriveImportSimple
    errorConnectGoogleDrive: "Gagal terhubung ke Google Drive",
    errorConnectFirst: "Harap hubungkan ke Google Drive terlebih dahulu",
    errorExtractFormData: "Gagal mengekstrak data form",
    errorSelectForm: "Gagal memilih form",

    // Success Messages - StepOneFormFields
    successImportedFromGoogleDrive: "Data berhasil diimport dari Google Drive",

    // Section Titles - StepTwo
    surveyConfiguration: "Konfigurasi Survey",
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

    // Status Page
    pageTitle: "Track Status",
    pageSubtitle: "Pantau progress submission survey Anda secara real-time.",
    statusAll: "Semua Status",
    statusInReview: "In Review",
    statusWaitingPayment: "Waiting Payment",
    statusScheduling: "Scheduling",
    statusPublishing: "Publishing",
    statusCompleted: "Completed",
    statusInReviewHelper: "Menunggu Review Admin",
    statusPaymentHelper: "Menunggu Pembayaran",
    statusSchedulingHelper: "Proses Penjadwalan",
    statusPublishingHelper: "Sedang Tayang",
    statusCompletedHelper: "Selesai",
    payNow: "Bayar Sekarang",
    contactSupport: "Butuh bantuan? Hubungi Support",
    noSubmissions: "Belum ada submission",
    createFirstSurvey: "Buat Survey Baru",
    noSubmissionsDesc: "Anda belum mengajukan survey apapun. Buat survey pertama Anda untuk memulai.",
    submittedOn: "Diajukan pada",
    days: "Hari",
    adDuration: "Durasi Iklan",

    winner: "pemenang",
  }
};

export type TranslationKey = keyof typeof translations.en;
