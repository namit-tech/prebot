# 🎬 Custom Animation Video Instructions

## 📁 **Where to Put Your Video:**

**Location**: `assets/videos/your-animation.mp4`

## 🎯 **Video Requirements:**

### **Format & Size:**
- **Format**: MP4 (recommended)
- **Size**: Max 10MB (for fast loading)
- **Duration**: Any length (will loop during speech)
- **Resolution**: 720p or 1080p

### **Content:**
- **Circular/round** animation works best
- **Face/character** animation preferred
- **Smooth motion** for better effect
- **No audio needed** (will be muted)

## 🚀 **How It Works:**

### **Animation Flow:**
1. **Question clicked** → Video starts
2. **Answer playing** → Video loops
3. **Answer ends** → Video stops

### **Fallback System:**
- If video fails to load → Original AI face animation
- If video autoplay blocked → Original AI face animation
- If video format not supported → Original AI face animation

## 📝 **Steps to Add Your Video:**

### **Step 1: Prepare Video**
1. **Create/edit** your animation video
2. **Export as MP4** format
3. **Keep file size** under 10MB
4. **Test** the video plays correctly

### **Step 2: Add to Project**
1. **Rename** your video to `your-animation.mp4`
2. **Copy** to `assets/videos/` folder
3. **Replace** the placeholder file

### **Step 3: Test Integration**
1. **Run** the application
2. **Click** any question
3. **Check** if video plays during answer
4. **Verify** video stops when answer ends

## 🔧 **Troubleshooting:**

### **Video Not Playing:**
- Check file format (must be MP4)
- Check file size (should be under 10MB)
- Check file path (`assets/videos/your-animation.mp4`)
- Check browser console for errors

### **Video Not Stopping:**
- Video should automatically stop when answer ends
- Check if `stopSpeakingAnimation()` is called
- Check browser console for errors

### **Fallback Animation:**
- If video fails, original AI face animation will show
- This ensures the app always works
- Check console for "Video failed to load" message

## 🎨 **Video Ideas:**

### **Good Animation Types:**
- **Talking head** animation
- **Character** speaking animation
- **Robot/AI** face animation
- **Abstract** geometric animation
- **Logo** animation with effects

### **Animation Tips:**
- **Loop seamlessly** (start and end should connect)
- **Keep it smooth** (avoid jerky movements)
- **Use bright colors** (looks better on screen)
- **Center the subject** (will be cropped to circle)

## 📱 **Mobile Compatibility:**

- **Same video** works on mobile interface
- **Mobile questions** → Desktop video plays
- **Responsive** design maintains aspect ratio

---

**Your custom animation video is ready to integrate!** 🎬✨

**Just put your MP4 file in `assets/videos/your-animation.mp4` and it will work!** 🚀
