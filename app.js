const { Api, TelegramClient } = require("telegram");
const { StoreSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { NewMessageEvent } = require('telegram/events/NewMessage');
const { Message } = require('telegram/tl/custom/message');
const { NewCallbackQueryDefaults } = require("telegram/events/CallbackQuery");
const Logger = require('telegram/extensions').Logger

const input = require("input");
const figlet = require("figlet");
const open = require('open');
const path = require('path');
const fs = require('fs');
const { exec } = require("child_process");
const log4js = require('log4js');
const fetch = require('node-fetch');
const currency = require('currency.js');

const liner = "===================================================================================================================";
const productCooldown = {};

let linksOpened = 0;
let linksSkipped = 0;


if(!checkFileExistsSync(path.join(process.cwd(), './config.json')))
{
    console.error("config.json not found, copy and change config.json.sample to config.json");
    return;
}

const configPath = path.join(process.cwd(), './config.json');
const ConfigData = fs.readFileSync(configPath);
const Config = JSON.parse(ConfigData);

if(Config.telegram.app_id == "10000")
{
    console.error("config.json app_id not set > https://core.telegram.org/api/obtaining_api_id");
    return;
}

const apiId = Config.telegram.app_id;
const apiHash = Config.telegram.app_hash;
const storeSession = new StoreSession("telegram_session");

var dir = path.join(process.cwd(), '/logs');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, 0744);
}

log4js.configure({
    appenders: { 
        'file': { type: 'fileSync', filename: 'logs/PB.log', maxLogSize: 10485760, numBackups: 3},
        console: { type: 'console' }
    },
    categories: { default: { appenders: ['file', 'console'], level: 'debug' } }
});

const logger = log4js.getLogger('PB'); 

let opsys = process.platform;
if (opsys == "darwin") {
    opsys = "macos";
} else if (opsys == "win32" || opsys == "win64") {
    opsys = "windows";
} else if (opsys == "linux") {
    opsys = "linux";
}

const client = new TelegramClient(storeSession, apiId, apiHash, 
{
    baseLogger: new Logger('error'),
    connectionRetries: 5,
});

async function run() {
    const result = await client.invoke(
      new Api.account.UpdateStatus({
        offline: false,
      })
    );
  };

(async () => {

    let versionInfo = await checkGithubVersion();

    figlet('Oizopower', function(err, data) {
        console.log(data);
        console.log("\n======================================================\n\n Partsbot - Platinum Telegram Link Opener (v"+versionInfo.local+" Remote-latest: v"+versionInfo.github+")\n\n Donate: https://www.ko-fi.com/oizopower\n\n======================================================");
        console.log("+ Bezig met opstarten");
    });
    
    await client.start({
        phoneNumber: async () => await input.text("+ Je telefoonnummer in (+31600000000): "),
        password: async () => await input.text("+ Je Telegram wachtwoord: "),
        phoneCode: async () =>
        await input.text("+ Voer de code in die je hebt ontvangen: "),
        onError: (err) => logger.info(err),
    });
    
    console.log("+ Wheeee! we zijn verbonden.");
    console.log(liner);
    
    setTimeout(() => {
        printMemoryUsage();    
    }, 2000);
    

    await new Promise(resolve => setInterval(() => resolve(run()), 3000));

    /**
     * TEST = 1165395320
     * PB = 1396614919
     * PB2 = 1647685570
     *  */ 

    let listChats = [1396614919, 1165395320]

    if(Config.hasOwnProperty("PartsBot2") && Config.PartsBot2.enabled)
    {
        listChats.push(1647685570)
    }

    client.addEventHandler(handleMessages, new NewMessage({chats: listChats}));
})();

async function handleMessages(event) 
{
    const message = event.message;
    const sender = await message.getSender();
    const buttonLink = [];
    const messageText = message.text;

    try {
        let titleUser = sender.title;

        if(titleUser !== undefined)
        {
            const isPB2 = (titleUser == "PartsBot - Direct Buy 2" || titleUser.includes("Announcements General")) ? true : false;
            // const isPB2 = (titleUser == "PartsBot - Direct Buy 2") ? true : false;

            if (titleUser.includes("Direct Buy") || titleUser.includes("PartsBot Amazon Alert") || titleUser.includes("Announcements General"))
            {
                let urlContainer = false;
                if(!isPB2)
                {
                    urlContainer = message.replyMarkup.rows[0].buttons;
                }
                else
                {
                    urlContainer = message.entities;
                }

                // Make array of all possible buttons
                if(urlContainer)
                {
                    let linkObject = {};

                    urlContainer.forEach(element => {
                        let typeLink = false;
    
                        if(element.hasOwnProperty("url"))
                        {
                            if(element.url.includes("/gp/product/")) {
                                typeLink = "checkout";
                            }
                            else if(element.url.includes("/checkout/turbo-initiate")) {
                                typeLink = "turbo";
                            }
                            else if(element.url.includes("/purchase_item/")) {
                                typeLink = "extension";
                            }
    
                            linkObject[typeLink] = element.url;
                        }
                    });
    
                    /** validate links */
                    if(!linkObject.turbo)
                    {
                        linkObject.turbo = linkObject.checkout;
                    } 
                    if(!linkObject.extension) {
                        linkObject.extension = linkObject.turbo;
                    }
    
                    Object.keys(linkObject).forEach(key => {
                        buttonLink.push(linkObject[key]);
                    });
                }

                if(buttonLink.length > 0)
                {
                    let productPriceReg = messageText.match(/Price: (.*)/i)[1];
                    let productPrice = formatPrice(productPriceReg);
                    
                    let lines = messageText.split('\n');
                    let productSoldBy = (!isPB2 ? messageText.match(/Sold by: (.*)/i)[1] : "");

                    let productData = {
                        "productModel": messageText.match(/Model: (.*)/i)[1],
                        "productSoldBy": productSoldBy,
                        "amazonCountry": productPriceReg.includes("€") ? "EUR" : "UK",
                        "productPrice": productPrice,
                        "amazonWareHouse": (productSoldBy.includes("Warehouse")) ? true : false,
                        "dateTime": new Date().toLocaleString(),
                        "productName": !isPB2 ? lines[lines.length - 1].replace(/\*\*/g,"") : lines[lines.length - 7].replace(/\[.*?\]/g, "").replace(/\*\*/g,"").trim(),
                        "website": lines[0].replace(/\*\*/g,""),
                        "source": false,
                        "chanTitle": titleUser
                    }

                    if(isPB2 && Config.hasOwnProperty("PartsBot2"))
                    {
                        // alternate Filtering.
                        let PB2_ProductTitle = productData.productName.toLowerCase()

                        if(productData.productModel == "Unknown")
                        {
                            let PB2Filters = Config.PartsBot2.filters;
                            let PB2RegArray = [];
                            for (var key in PB2Filters) {
                                if (PB2Filters.hasOwnProperty(key)) {
                                    PB2RegArray.push(key);
                                }
                            }
                            PB2RegArray = PB2RegArray.reverse();
    
                            let PB2Reg = RegExp("(" + PB2RegArray.join("|") + ")", 'i');
                            let PB2Model = PB2_ProductTitle.match(PB2Reg);
                            
                            if(PB2Model != null)
                            {
                                if(PB2Filters.hasOwnProperty(PB2Model[0]))
                                {
                                    productData.productModel = PB2Filters[PB2Model[0]];
                                }
                            }
                        }

                        let source = messageText.match(/Source: (.*)/i);

                        if(source != null) {
                            productData.source = source[1];
                        }
                    }

                    // cooldown timers
                    if(Config.hasOwnProperty("cooldownTimer"))
                    {
                        if(productCooldown.hasOwnProperty(productData.productName + productData.productPrice) && 
                        Date.now()-productCooldown[productData.productName + productData.productPrice] < Config.cooldownTimer*1000)
                        {
                            logger.error("PRODUCT ON COOLDOWN ("+Config.cooldownTimer+" sec): " + productData.productName);
                            console.log(liner);
                            return;
                        }
                        else
                        {
                            productCooldown[productData.productName + productData.productPrice] = Date.now();
                        }
                    }
                    else
                    {
                        logger.warn(" Cooldown timer not found in config.json, please update your config (see latest config.json.sample)");
                        console.log(liner);
                    }

                    // start normal filters
                    let filterStatus = false;

                    if (Config.filters.hasOwnProperty(productData.productModel)) 
                    {
                        if (Config.filters[productData.productModel].hasOwnProperty(productData.amazonCountry))
                        {
                            if( productData.productPrice <= Config.filters[productData.productModel][productData.amazonCountry]['maxprice'] && Config.filters[productData.productModel][productData.amazonCountry]['enabled'] )
                            {
                                filterStatus = true;
                                if(productData.amazonWareHouse)
                                {
                                    if(Config.filters[productData.productModel][productData.amazonCountry]['useWarehouse'] && !buttonLink.includes("amazon.null"))
                                    {
                                        openBrowser(opsys, buttonLink, productData);
                                    }
                                    else
                                    {
                                        filterStatus = false;
                                    }
                                }
                                else
                                {
                                    if(!buttonLink.includes("amazon.null"))
                                    {
                                        openBrowser(opsys, buttonLink, productData);
                                    }
                                    else
                                    {
                                        filterStatus = false;
                                    }
                                }
                            } 
                        }
                    }
                    

                    logger.info(" " + productData.productName);
                    logger.info(" ");
                    logger.info(" Channel: " + productData.chanTitle + (productData.source ? " (Source TG: " + productData.source + ")" : ""));
                    logger.info(" Website: " + productData.website);
                    if(productData.productModel) logger.info(" Model: " + productData.productModel);
                    logger.info(" Price: " + productData.productPrice);
                    logger.info(" Country: " + productData.amazonCountry);
                    logger.info(" Is WHD: " + (!isPB2 ? (productData.amazonWareHouse ? "Yes" : "No") : "Unknown"));
                    logger.info(" ");

                    logger.info(" Filters");
                    if (Config.filters.hasOwnProperty(productData.productModel) && Config.filters[productData.productModel].hasOwnProperty(productData.amazonCountry))
                    {
                        logger.info(" Enabled: " + (Config.filters[productData.productModel][productData.amazonCountry]['enabled'] ? "Yes" : "No") + ", Max Price: " 
                        + Config.filters[productData.productModel][productData.amazonCountry]['maxprice'] + ", WHD accepted: " 
                        + (Config.filters[productData.productModel][productData.amazonCountry]['useWarehouse'] ? "Yes" : "No"));
                    }
                    else {
                        logger.info(" No filters found in config");
                    }
                    logger.info(" ");
                    
                    if (Config.filters.hasOwnProperty(productData.productModel) && 
                        Config.filters[productData.productModel].hasOwnProperty("advanced") && 
                        Config.filters[productData.productModel]["advanced"].hasOwnProperty("buttons"))
                    {
                        logger.info(" Advanced filters:");
                        logger.info(" Use multiple buttons: " + (Config.filters[productData.productModel]["advanced"]["buttons"]["enableMultipleButtons"] ? "Yes" : "No") + ", Custom buttons: " 
                        + Config.filters[productData.productModel]["advanced"]["buttons"]["overrideButtons"]);
                        logger.info(" ");
                    }
                    
                    logger.info(" Filter Status: " + (filterStatus ? "\x1b[32mAccepted\x1b[0m" : "\x1b[31mDenied\x1b[0m"));

                    if(filterStatus){
                        linksOpened++;
                    } else {
                        linksSkipped++;
                    }

                    console.log(liner);
                }
                else
                {
                    logger.warn("Button not found or wrongly formatted product");
                }
            }
        }
    } 
    catch (error) 
    {
        logger.warn(error);
    }
}

async function openBrowser(opsys, buttonLink, productData) 
{
    let linksToOpen = [];

    if(Config.hasOwnProperty("profiles"))
    {
        for (var i = 0; i < Config.profiles.length; i++) 
        {
            if(Config.profiles[i].enabled)
            {
                if (Config.filters.hasOwnProperty(productData.productModel) && 
                    Config.filters[productData.productModel].hasOwnProperty("advanced") && 
                    Config.filters[productData.productModel]["advanced"].hasOwnProperty("buttons")
                    && Config.filters[productData.productModel]["advanced"]["buttons"]["enableMultipleButtons"])
                {
                    let multipleLinks = Config.filters[productData.productModel]["advanced"]["buttons"]["overrideButtons"];

                    for(var j = 0; j < multipleLinks.length; j++)
                    {
                        /** Check if we need to use AddressID's */
                        if(Config.profiles[i].hasOwnProperty("addressID") && buttonLink[multipleLinks[j]].includes("/purchase_item/"))
                        {
                            linksToOpen.push({profile: Config.profiles[i].profileName, url: checkForAddressID(buttonLink[multipleLinks[j]], Config.profiles[i].addressID)});
                        }
                        else
                        {
                            linksToOpen.push({profile: Config.profiles[i].profileName, url: checkForAddressID(buttonLink[multipleLinks[j]])});
                        }
                    }
                }
                else
                {
                    if(Config.profiles[i].hasOwnProperty("addressID") && buttonLink[Config.button.number].includes("/purchase_item/"))
                    {
                        linksToOpen.push({profile: Config.profiles[i].profileName, url: checkForAddressID(buttonLink[Config.button.number], Config.profiles[i].addressID)});
                    }
                    else
                    {
                        linksToOpen.push({profile: Config.profiles[i].profileName, url: buttonLink[Config.button.number]});
                    }
                }
            }
        }
    }
    else
    {
        if (Config.filters.hasOwnProperty(productData.productModel) && 
            Config.filters[productData.productModel].hasOwnProperty("advanced") && 
            Config.filters[productData.productModel]["advanced"].hasOwnProperty("buttons")
            && Config.filters[productData.productModel]["advanced"]["buttons"]["enableMultipleButtons"])
        {
            let multipleLinks = Config.filters[productData.productModel]["advanced"]["buttons"]["overrideButtons"];

            for(var j = 0; j < multipleLinks.length; j++)
            {
                linksToOpen.push({profile: 'none', url: checkForAddressID(buttonLink[multipleLinks[j]])});
            }
        }
        else
        {
            linksToOpen.push({profile: 'none', url: buttonLink[Config.button.number]});
        }
    }

    if(linksToOpen.length === 0)
    {
        linksToOpen.push({profile: 'none', url: buttonLink[Config.button.number]});
    }

    if(linksToOpen.length > 0)
    {
        let startupPath = "";

        switch(opsys) {
            case "windows":
                startupPath = 'start "" chrome.exe';
            break;
            case "macos":
                startupPath = 'open -n -a "Google Chrome" --args';
            break;
            case "linux":
                startupPath = '/usr/bin/google-chrome';
            break;
        }

        if(Config.hasOwnProperty("chrome") && Config.chrome.hasOwnProperty("path"))
        {
            if(Config.chrome.path != "autodetect") 
            {
                startupPath = '"' + Config.chrome.path + '"';
            }
        }

        let cleanUrls = [];
        for (var i = 0; i < linksToOpen.length; i++) 
        {
            if(linksToOpen[i].profile == "none")
            {
                cleanUrls.push(startupPath + ' "'+linksToOpen[i].url+'"');    
            }
            else
            {
                cleanUrls.push(startupPath + ' --profile-directory="'+linksToOpen[i].profile+'" "'+linksToOpen[i].url+'"');
            }
        }

        for (var j = 0; j < cleanUrls.length; j++) 
        {
            try{
                exec(cleanUrls[j], (error, stdout, stderr) => {
                    if (error) {
                        console.log(error.message);
                        return;
                    }
                });

                if(Config.telegram.notifySelf !== undefined && Config.telegram.notifySelf)
                {
                    await client.sendMessage('me',{
                        message:"Following product opened on Telegram Link Opener: \nProduct: " + productData.productName + "\nWebsite:" + productData.website + "\nURL: " + linksToOpen[j].url
                    });
                }
            }
            catch(error) {
                logger.error(error)
            }
        }
    }
}

async function checkGithubVersion()
{
    /* Local version */
    const packageFilePath = path.join(__dirname, './package.json');
    const packageFile = fs.readFileSync(packageFilePath);
    const package = JSON.parse(packageFile);

    const response = await fetch('https://api.github.com/repos/Oizopower/PB-Telegram-Linkopener/releases/latest', {
        headers: 
        {
            'Content-Type': 'application/json',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        }
    });
    
    const data = await response.json();
    return {'local': package.version, 'github': data.tag_name};
}

function checkFileExistsSync(filepath){
    let flag = true;
    try{
      fs.accessSync(filepath, fs.constants.F_OK);
    }catch(e){
      flag = false;
    }
    return flag;
}

function formatPrice(price)
{
    price = price.replace(/[^0-9.,+-]/g, '').trim();

    let cutPrice = price.split('')
    let thousandSeparator = false;
    let decimalSeparator = false;

    for(var j = 0; j < 3; j++)
    {
        if(cutPrice[j] == "." || cutPrice[j] == ",")
        {
            thousandSeparator = cutPrice[j];
        }
    }

    price = price.replace(thousandSeparator, '');

    cutPrice.reverse();
    
    for(var k = 0; k < 3; k++)
    {
        if(cutPrice[k] == "." || cutPrice[k] == ",")
        {
            decimalSeparator = cutPrice[k];
        }
    }

    price = price.replace(decimalSeparator, '.');

    if(decimalSeparator === false) {
        price = price + ".00"
    }
    
    checkPrice = currency(price, { precision: 2 });
    
    return checkPrice.value;
    
}

function getDomainExtension(url)
{
    let domain = (new URL(url)).hostname.replace('www.','');
    let domSplit = domain.split(".");
    let extension = domSplit[domSplit.length - 1]

    return extension;
}

function checkForAddressID(url, addressID)
{
    if(addressID == undefined) {
        addressID = {};
    }

    let domainExtension = getDomainExtension(url);

    if(addressID.hasOwnProperty(domainExtension.toUpperCase()))
    {
        if(addressID.enabled)
        {
            url = url + "&addressID=" + addressID[domainExtension.toUpperCase()];
        }
    }

    return url;
}

function printMemoryUsage()
{
    let mem = process.memoryUsage();
    logger.mark(" MEMORY USAGE - RSS: " + mem.rss + " | HEAPTOTAL: " + mem.heapTotal + " | HEAPUSED: " + mem.heapUsed + " | EXTERNAL: " + mem.external + " | ARRAYBUFFERS: " + mem.arrayBuffers )
    console.log(liner);
}

function printStatus()
{
    let DonateMessages = [
        "IF YOU MANAGED TO GRAB SOMETHING, DONT FORGET TO DONATE"
    ]

    logger.mark(" \x1b[1m\x1b[33m" + DonateMessages[Math.floor(Math.random()*DonateMessages.length)], " - https://ko-fi.com/oizopower\x1b[0m")
    logger.mark(" LINKS OPENED: " + linksOpened + " | LINKS SKIPPED: " + linksSkipped)
    console.log(liner);
}

setInterval(printMemoryUsage, 60 * 60 * 1000);
setInterval(printStatus, 60 * 30 * 1000);
