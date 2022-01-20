Component({
    selector: 'custom-button',
    structure: './custom-button.html',
    style: './custom-button.css',
    script: {
        // Properties
        test: 1,
        text: {
            another: 'Hello'
        },

        // Core
        onElementCreate(element) {
            console.log('Component Created', this)
            // this.element = element;
        },
        onElementLoad(content) {
            console.log('Component Loaded')
            // this.element = content;
        },
        onElementDestroy() {
            console.log('Component Removed')
        },
        onElementUpdate() {
            console.log('Component Updated')
        },

        // Custom
        onInput(e) {
            // this.test += 1;
            console.log('Hello')
        },
        onSubmit(e) {
            this.text.another = this.test;
        }
    }
});