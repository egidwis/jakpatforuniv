# 🎬 Google OAuth Verification Video Script
## Multi-Step Form - Google Forms Question Counter Application

### 📋 **Requirements Checklist**
- ✅ End-to-end flow including OAuth grant process
- ✅ Complete OAuth Consent Screen (English language)
- ✅ Demonstrate how each requested scope is used
- ✅ Show overall application purpose
- ✅ Voice/text narration explaining each step

---

## 🎯 **Video Duration**: 2-3 minutes (CONCISE VERSION)
## 🎤 **Narration Style**: Clear, professional voice-over with screen highlights

---

## 📝 **CONCISE VIDEO SCRIPT**

### **SCENE 1: Context & OAuth Authentication** *(0:00 - 1:00)*

**🎬 Screen Action**:
- Quick show of jakpatforuniv.com → submit.jakpatforuniv.com navigation
- Display multi-step form with "Google Form" vs "From other source" choice
- Click "Google Form" → "Hubungkan dengan Google Drive" button
- **CRITICAL**: Show OAuth consent screen in ENGLISH
- Highlight all 3 scopes clearly:
  - "See and download all your Google Drive files" (drive.readonly)
  - "View your forms in Google Drive" (forms.body.readonly)
  - "View responses to your forms" (forms.responses.readonly)

**🎤 Narration** (Fast-paced but clear):
> "This is Jakpat for Universities - our platform helps universities distribute their surveys to our qualified respondent network. When users import Google Forms for distribution, they authenticate via OAuth. Here's the consent screen showing our three required scopes: 'drive.readonly' to access their Google Drive, 'forms.body.readonly' to read form structure for safety validation, and 'forms.responses.readonly' for response data if needed. Notice the English language setting. I'll click Allow."

**🎬 Screen Action**:
- Click "Allow" button
- Show successful authentication

---

### **SCENE 2: Scope Usage Demonstration** *(1:00 - 2:15)*

**🎬 Screen Action** (Rapid sequence):
- Click "Cari Google Forms" → Show Drive API listing researcher's forms
- Select a form → Show Forms API extracting structure and question count
- Display auto-filled read-only fields with imported data
- Show final accurate question count vs manual counting

**🎤 Narration** (Continuous, explaining each API call):
> "Now watch each scope in action. First, 'drive.readonly' - clicking Search retrieves the university's Google Forms from their Drive, showing survey names and IDs. Next, 'forms.body.readonly' - selecting this survey uses Forms API to extract complete structure, providing precise question counts for our administrative safety checks. We filter out non-questions like headers and images to ensure accurate content validation before distributing to our respondent network. This imported data auto-fills our distribution form, protecting our respondents from inappropriate content."

---

### **SCENE 3: Conclusion & Security** *(2:15 - 3:00)*

**🎬 Screen Action**:
- Show completed survey creation workflow
- Display university/academic context and data security features
- Return to jakpatforuniv.com showing integration context

**🎤 Narration**:
> "This demonstrates our complete OAuth integration for Jakpat for Universities. We use minimum necessary read-only permissions to help universities distribute their surveys to our respondent network with 100% question counting accuracy. This serves legitimate educational purposes - we need accurate question counts for administrative safety to ensure our respondents receive appropriate surveys and aren't exposed to inappropriate or suspicious content. All form data remains secure in Google's ecosystem, supporting universities in safely reaching qualified respondents through our platform."

---

## 🎥 **Technical Recording Notes**

### **Pre-Recording Checklist**:
- [ ] Ensure Google account has multiple Google Forms for demonstration
- [ ] Set browser/OS language to English
- [ ] Clear browser cache to force fresh OAuth flow
- [ ] Test OAuth flow beforehand to ensure smooth recording
- [ ] Prepare screen recording software with highlight capabilities

### **During Recording**:
- [ ] Record in high resolution (1080p minimum)
- [ ] Use mouse highlighting/circles for important elements
- [ ] Speak slowly and clearly
- [ ] Pause between major sections for editing
- [ ] Show the complete OAuth consent screen clearly

### **Key Elements to Highlight Visually**:
- OAuth consent screen with English language setting
- Each scope and its description
- API responses showing data being retrieved
- Form import process and data extraction
- Read-only protection of imported data

---

## 🔍 **Compliance Verification**

### **Google's Requirements Met**:
✅ **End-to-end flow**: Complete OAuth → Drive access → Form import → Data usage
✅ **OAuth Consent Screen**: Shown in English with exact scopes
✅ **Scope demonstration**: Each scope's practical usage clearly shown
✅ **Application purpose**: Google Forms question counter functionality explained
✅ **Narration**: Professional voice-over explaining technical details

### **Additional Best Practices**:
✅ **User privacy**: Read-only access emphasized
✅ **Data security**: Secure handling practices mentioned
✅ **Practical value**: Real-world application benefits demonstrated
✅ **Technical accuracy**: Actual API calls and responses shown

---

## 📤 **Post-Production**

### **Video Editing Notes**:
- Add text overlays highlighting key scope usage moments
- Include zoom-ins on OAuth consent screen details
- Add smooth transitions between demonstration sections
- Ensure audio is clear and professional quality
- Export in MP4 format suitable for Google submission

### **Final Submission**:
- Upload to unlisted YouTube or host on secure platform
- Reply to OAuth verification team email with new video link
- Include brief description of changes made addressing their feedback