async function LoadComponents(components = ['']) {
    components = components.filter((x) => x);
    for (let i = 0; i < components.length; i++) {
        const script = document.createElement('script');
        script.src = components[i];
        document.head.appendChild(script)
    }
}

async function Component(options) {
    const root = document.currentScript.src.split('/').slice(0, -1).join('/') + '/';

    customElements.define(options.selector, class extends HTMLElement {
        propertyListeners = [];

        constructor() {
            super();
            this.component = Object.assign({}, options.script);
            this.loadVisuals();
        }

        doEvent(name, ...args) {
            if (this.component[name]) this.component[name](...args);
        }

        async loadVisuals() {
            this.attachShadow({ mode: 'open' })
            if (options.style) {
                await this.loadCss(root + options.style)
            }
            if (options.structure) {
                await this.loadTemplate(root + options.structure)
            }
            this.bindToEvents();
            this.bindToProperties();
            this.generateBindings();
            this.calculateBinds();
            this.doEvent('onElementLoad', this.shadowRoot);
        }

        async loadCss(path) {
            try {
                const response = await fetch(path);
                const responseText = await response.text();
                const stylesheet = document.createElement('style');
                stylesheet.innerHTML = responseText;
                this.shadowRoot.appendChild(stylesheet);
            } catch (e) {
                printComponentError(options.selector, 'Stylesheet could not be fetched.', {
                    Path: path
                });
            }
        }

        async loadTemplate(path) {
            try {
                const response = await fetch(path);
                const responseText = await response.text();
                this.shadowRoot.innerHTML = responseText + '\n' + this.shadowRoot.innerHTML ;
            } catch (e) {
                printComponentError(options.selector, 'HTML could not be fetched.', {
                    Path: path
                });
            }
        }

        getElementsWithSelector(startsWith) {
            return [...this.shadowRoot.querySelectorAll('*')]
            .filter((element) => [...element.attributes].filter((attribute) => attribute.name.startsWith(startsWith)).length > 0);
        }

        bindToEvents() {
            const elementsNeededBinding = this.getElementsWithSelector('event');
            
            elementsNeededBinding.forEach(element => {
                [...element.attributes].forEach((e) => {
                    if (e.name.startsWith('event')) {
                        const eventName = e.name.slice(6);
                        element.addEventListener(eventName, (event) => {
                            localiseContext(options.selector, e.value, this.component, { event });
                        });
                        element.removeAttribute(e.name)
                    }
                });
            });
        }

        generateBindings() {
            removeDuplicates(this.getElementsWithSelector('get')).forEach(element => {
                new MutationObserver((mutations) => {
                    this.calculateBinds();
                    
                })
                .observe(element, {attributes: true});
            });

            removeDuplicates(this.getElementsWithSelector('set')).forEach((element) => {
                const inputTypes = ['INPUT', 'SELECT', 'TEXTAREA'];
                if (inputTypes.includes(element.nodeName)) {
                    element.addEventListener('change', () => this.calculateBinds());
                    element.addEventListener('input', () => this.calculateBinds());
                }
            })

            this.bindToGetters();
            this.bindToSetters();
        }

        bindToGetters() {
            const elementsNeededBinding = this.getElementsWithSelector('get');
            
            elementsNeededBinding.forEach(element => {
                [...element.attributes].forEach((e) => {
                    if (e.name.startsWith('get')) {
                        const valueName = e.name.slice(4);

                        this.propertyListeners.push({
                            data: e.nodeValue,
                            transform: (raw) => {
                                if (this.component[raw] != element[valueName]) {
                                    this.component[raw] = element[valueName];
                                }
                            }
                        });
                    }
                });
            });
        }

        bindToSetters() {
            const elementsNeededBinding = this.getElementsWithSelector('set');
            
            elementsNeededBinding.forEach(element => {
                [...element.attributes].forEach((e) => {
                    if (e.name.startsWith('set')) {
                        const valueName = e.name.slice(4);

                        this.propertyListeners.push({
                            data: e.nodeValue,
                            transform: (raw) => {
                                if (this.component[raw] != element[valueName]) {
                                    element[valueName] = this.component[raw];
                                }
                            }
                        });
                    }
                });
            });
        }

        bindToProperties() {
            Object.keys(this.component).forEach(key => {
                if (typeof this.component[key] !== 'function') {
                    this.component[key] = JSON.parse(JSON.stringify(this.component[key]));
                }
            });

            this.component = watch(this.component, (options) => {
                this.doEvent('onElementUpdate');
                this.dispatchEvent(new CustomEvent('componentUpdate'));
                this.calculateBinds();
            });

            this.component.element = this;
            this.doEvent('onElementCreate', this);

            [...findBindTextNodes(this.shadowRoot), ...findBindAttrNodes(this.shadowRoot)].forEach((e) => {
                this.propertyListeners.push({
                    data: e.nodeValue,
                    transform: (raw) => {
                        const matches = raw.match(/{{.*?}}/gm);
                        
                        matches.forEach(match => {
                            raw = raw.replace(match, localiseContext(options.selector, match.slice(2, -2).trim(), this.component));
                        });

                        if (e.nodeValue != raw) {
                            e.nodeValue = raw;
                        };
                    }
                })
            });
        }

        calculateBinds() {
            this.propertyListeners.forEach(listener => listener.transform(listener.data));
        }
    });

    function removeDuplicates(array) {
        return array
            .filter((value, index, self) => index === self.findIndex((t) => (
                t.place === value.place && t.name === value.name
            )))
    }

    function printComponentError(selector, message, args = {}, nativeError) {
        let error = `[ERROR]\nComponent: <${selector}>\nMessage: ${message}`;
        if(Object.keys(args).length > 0) {
            error += '\n\nDetails:'
            Object.keys(args).forEach((e) => error += `\n${e}: ${args[e]}`);
        }

        if(nativeError) {
            error += '\n\n';
        }
        
        console.error(error, nativeError);
    }

    function localiseContext(componentSelector, statement, context, extras) {
        const func = function() {
            const $ = extras;
            return eval(statement);
        };

        try {
            return func.call(context);
        }
        catch (e) {
            printComponentError(componentSelector, 'There was an error within the binding - please check your code.', {
                Evaluating: statement
            }, e)
            return undefined;
        }
    }

    function findBindTextNodes(el){
        var n, a=[], walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null,false);
        while(n=walk.nextNode()) n.nodeValue.match(/{{.*?}}/gm)?.length > 0 ? a.push(n) : null;
        return a;
    }

    function findBindAttrNodes(el){
        var n, a=[], walk=document.createTreeWalker(el,NodeFilter.SHOW_ELEMENT,null,false);
        while(n=walk.nextNode()) [...n.attributes].forEach((attr) => attr.value.match(/{{.*?}}/gm)?.length > 0 ? a.push(attr) : null)
        return a;
    }

    function watch(object, change) {
        if (object && object.proxy) {
             return object;
        }
        var proxy = new Proxy(object, {
            get: function(object, name) {
                if (name == 'proxy') {
                    return true;
                }
                return object[name];
            },
            set: function(object, name, value) {
                var old = object[name];
                if (value && typeof value == 'object') {
                    // The new object needs to be watched as well.
                    value = watch(value, change);
                }
                object[name] = value;
                change({object, key: name, old, value});
                return true;
            }
        });
        for (var prop in object) {
            if (object.hasOwnProperty(prop) && object[prop] &&
                typeof object[prop] == 'object') {
                // Watch all child objects
                object[prop] = watch(object[prop], change);
            }
        }
        return proxy;
    }
}