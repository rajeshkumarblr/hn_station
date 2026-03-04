const { chromium } = require('playwright');
const path = require('path');

// Target directory
const outDir = '/home/rajesh/proj/hn_station/screenshots';

(async () => {
    // Launch in headless
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2, // High resolution for Retina screens
    });

    const page = await context.newPage();

    console.log("1. Taking screenshot of feed page...");
    await page.goto('https://hnstation.dev', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500); // Wait for potential fade-in/animations
    await page.screenshot({ path: path.join(outDir, 'feed_page.png') });

    console.log("2. Finding a good article for split view screenshot...");
    // Find story cards
    const stories = await page.locator('div[role="button"]').all();
    let selectedStory = null;

    // Try to find one that is likely a good article (has a domain, not github)
    for (const story of stories) {
        const text = await story.innerText();
        if (text.includes('.') && !text.includes('github.com')) {
            selectedStory = story;
            break;
        }
    }

    // Fallback to first if none match
    if (!selectedStory && stories.length > 0) {
        selectedStory = stories[0];
    }

    if (selectedStory) {
        await selectedStory.click();
        await page.waitForTimeout(2000); // Wait for sliding reader pane animation
        await page.screenshot({ path: path.join(outDir, 'article.png') });

        console.log("3. Enabling Split View...");
        // Click Web View if available to make sure it looks impressive
        const webBtn = page.locator('button[title="Web View"]');
        if (await webBtn.count() > 0) {
            await webBtn.click();
            await page.waitForTimeout(1000);
        }

        const splitTab = page.locator('button[title="Split View"]');
        if (await splitTab.count() > 0) {
            await splitTab.click();
            await page.waitForTimeout(3000); // Wait for discussion load and split animation
            await page.screenshot({ path: path.join(outDir, 'discussion.png') });
        } else {
            console.error("Could not find Split View tab button");
        }
    } else {
        console.error("Could not find a story card to click on");
    }

    await browser.close();
    console.log("Screenshots completed successfully!");
})();
