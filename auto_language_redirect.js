if(Intl && Intl.Locale) {
    let links = document.head.getElementsByTagName("link");
    let languageLinkDictionary = {};
    for (const link of links) {
        if (link.rel === "alternate") {
            languageLinkDictionary[link.hreflang] = link.href;
        }
    }

    let navLanguages = navigator.languages.map(localeStr => new Intl.Locale(localeStr).language);

    for (const navLanguage of navLanguages) {
        let redirect = languageLinkDictionary[navLanguage];
        if (redirect) {
            window.location.replace(redirect);
            break;
        }
    }
}
