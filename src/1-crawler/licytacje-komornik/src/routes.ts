import {Dataset, createPlaywrightRouter} from 'crawlee';

export const router = createPlaywrightRouter();

// homepage
router.addDefaultHandler(async ({page, enqueueLinks, log}) => {
    log.info(`loading initial pages with tables`);
    await page.waitForSelector('#sidebar');

    let links = (
        await page.$$eval('#sidebar > div > div:nth-child(1) > a, #sidebar > div > div:nth-child(3) > a',
            (elements) => {
                return elements.map((element) => element.getAttribute('href'));
            })
    )
        .filter((link) => link != null);

    log.info(`enqueueing new URLs: ['${links.join("', '")}']']`);

    await enqueueLinks({
        urls: <string[]>links,
        label: 'list',
    });
})

// page within specific filter
router.addHandler('list', async ({page, parseWithCheerio, enqueueLinks, log}) => {
    log.info(`loading pages '${page.title}'`);
    await page.waitForSelector('#main-content > div > div:nth-child(3)');
    const $ = await parseWithCheerio();
    let text = $('#main-content > div > div:nth-child(3)')
        .text().split(' ');
    const pageCount = parseInt(text[text.length - 2]);
    const pages = [];
    for (let i = 1; i <= pageCount; i++) {
        pages.push(`${page.url()}?page=${i}`);
    }

    log.info(`enqueueing new URLs: ['${pages.join("', '")}']`);
    await enqueueLinks({
        urls: pages,
        label: 'page',
    });
});

// page with table
router.addHandler('page', async ({page, parseWithCheerio, enqueueLinks, log}) => {
    log.info(`loading page '${page.title}'`);
    await page.waitForSelector('#main-content > table');
    const $ = await parseWithCheerio();

    const items = $('#main-content > table > tbody > tr')
        // take only rows without e-auctions
        .filter((_, element) => $(element).find('td:nth-last-child(2)').text().length == 0)
        .map((_, element) => {
            const id = $(element).find('td:last-child > a').attr('href')?.split('/')?.pop();
            return {
                id: id,
                url: $(element).find('td:last-child > a').attr('href'),
                hasPhoto: $(element).find('td:nth-child(2)').has('.photo').length > 0,
                auctionDate: $(element).find('td:nth-child(3)').text().trim(),
                name: $(element).find('td:nth-child(4) > div').text().trim(),
                city: $(element).find('td:nth-child(5)').text().split('<br>').shift()?.trim(),
                district: $(element).find('td:nth-child(5)').text().split('<br>').pop()?.trim()?.replace('/[\(\)]*/gm', ''),
                initialPrice: (parseInt($(element).find('td:nth-child(6)').text().trim()
                    .replace("zł", "")
                    .replace(",", "")
                    .replace("&nbsp;", "")) ?? 100) / 100,
                source: 'page'
            }
        })
        .get();

    await Dataset.pushData([...items]);

    await enqueueLinks({
        urls: <string[]>items.map(x => x.url),
        label: 'detail',
    });
});

// details page
router.addHandler('detail', async ({page, parseWithCheerio, log}) => {
    log.info(`loading page details of ID ['${page.url().split('/').pop()}']...`);

    await page.waitForSelector('#Preview');
    const $ = await parseWithCheerio();

    const text = $('#Preview').html();
    const address = <string | null>$('input#hidden_address').val();
    const pictures = $('#Picture span a')
        .map((_, element) => $(element).attr('href'))
        .get();
    
    const item = {
        id: page.url().split('/').pop(),
        address: address,
        pictures: pictures,
        description: text,
        source: 'detail'
    };
    
    await Dataset.pushData(item);
});
