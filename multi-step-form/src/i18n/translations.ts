// Translation files for English and Indonesian

export type Language = 'en' | 'id';

export const translations = {
  en: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Submit your survey to 2 million Jakpat respondents",

    // Step Navigation
    step1: "Survey Details",
    step2: "Data & Incentives",
    step3: "Review & Payment",

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

    // Step One Method Selection
    startByFillingData: "Start by filling in survey data",
    chooseMethodSuitable: "Choose the method that suits you best. You can change the method later.",
    importFromGoogleForm: "Import from Google Form",
    manualFill: "Fill Manually",
    backButton: "Back",
    recommended: "RECOMMENDED",
    googleFormImportTitle: "Import from Google Form",
    googleFormImportDescription: "Import questions from Google Forms with 100% accuracy. Data automatically filled from your form.",
    benefit100Accurate: "100% accurate",
    benefitAutoFill: "Auto-fill all data",
    benefitSaveTime: "Save time",
    manualFillTitle: "Fill Manually",
    manualFillDescription: "Suitable for platforms other than Google Forms or if you want full control.",
    fillManually: "Fill Manually",
    canChangeMethodLater: "You can change the method later if needed",
    byContinuingAgree: "By continuing, you agree to our",
    andText: "and",
    termsConditions: "Terms and Conditions",
    noGoogleForm: "Don't have a Google Form?",
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
    personalDataWarningTitle: "⚠️ Warning: Personal Data Detected",
    personalDataWarningSubtitle: "Your form contains questions about personal data",
    personalDataDetectedLabel: "Questions detected containing personal data:",
    personalDataPolicyExplanation: "According to Jakpat's Terms & Conditions, we do not allow surveys that ask for respondents' personal data such as:",
    personalDataExample1: "Personal email addresses",
    personalDataExample2: "Phone number/WhatsApp",
    personalDataExample3: "Home address",
    personalDataExample4: "ID number or other personal identifiers",
    personalDataWhatHappens: "🔍 What happens if you continue?",
    personalDataWhatHappensDetail: "Your survey will be manually reviewed by our admin team. No payment is required at this time, and admin will contact you for further confirmation.",
    readTermsConditions: "Read Terms & Conditions",
    personalDataContinueButton: "I Understand, Continue for Admin Review",
    personalDataCancelButton: "← Go Back & Edit Form",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Failed to connect to server. Please check your internet connection.",
  },

  id: {
    // Header & Navigation
    appTitle: "Jakpat for Universities",
    appTagline: "Iklankan survey kamu ke 2 Juta responden Jakpat",

    // Step Navigation
    step1: "Detail Survey",
    step2: "Data diri & Insentif",
    step3: "Review & Pembayaran",

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

    // Step One Method Selection
    startByFillingData: "Mulai dengan mengisi data survei",
    chooseMethodSuitable: "Pilih metode yang paling sesuai untuk Anda. Anda dapat mengubah metode nanti.",
    importFromGoogleForm: "Import dari Google Form",
    manualFill: "Isi Manual",
    backButton: "Kembali",
    recommended: "RECOMMENDED",
    googleFormImportTitle: "Import dari Google Form",
    googleFormImportDescription: "Import pertanyaan dari Google Forms dengan akurasi 100%. Data otomatis terisi dari form Anda.",
    benefit100Accurate: "100% akurat",
    benefitAutoFill: "Auto-fill semua data",
    benefitSaveTime: "Hemat waktu",
    manualFillTitle: "Isi Manual",
    manualFillDescription: "Cocok untuk platform selain Google Forms atau jika Anda ingin kontrol penuh.",
    fillManually: "Isi Secara Manual",
    canChangeMethodLater: "Anda dapat mengubah metode nanti jika diperlukan",
    byContinuingAgree: "Dengan melanjutkan, Anda setuju dengan",
    noGoogleForm: "Tidak punya Google Form?",
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
    personalDataWarningTitle: "⚠️ Peringatan: Data Pribadi Terdeteksi",
    personalDataWarningSubtitle: "Form Anda mengandung pertanyaan tentang data pribadi responden",
    personalDataDetectedLabel: "Pertanyaan yang terdeteksi mengandung data pribadi:",
    personalDataPolicyExplanation: "Sesuai Syarat & Ketentuan Jakpat, kami tidak mengizinkan penyebaran survey yang menanyakan data pribadi responden seperti:",
    personalDataExample1: "Email pribadi",
    personalDataExample2: "Nomor telepon/WhatsApp",
    personalDataExample3: "Alamat rumah/tempat tinggal",
    personalDataExample4: "NIK atau nomor identitas lainnya",
    personalDataWhatHappens: "🔍 Apa yang terjadi jika Anda melanjutkan?",
    personalDataWhatHappensDetail: "Survey Anda akan direview manual oleh tim admin kami. Tidak ada pembayaran yang diperlukan saat ini, dan admin akan menghubungi Anda untuk konfirmasi lebih lanjut.",
    readTermsConditions: "Baca Syarat & Ketentuan Lengkap",
    personalDataContinueButton: "Saya Mengerti, Lanjutkan untuk Review Admin",
    personalDataCancelButton: "← Kembali & Edit Form",

    // Error Messages - PaymentSuccess & PaymentFailed
    errorConnectionFailed: "Gagal terhubung ke server. Periksa koneksi internet Anda.",
  }
};

export type TranslationKey = keyof typeof translations.en;
